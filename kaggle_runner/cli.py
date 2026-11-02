#!/usr/bin/env python3
"""
Kaggle Notebook Runner CLI

Run Kaggle notebooks with parameters, poll for completion, and download outputs.
Uses the official Kaggle API (kaggle>=2.0).
"""

import os
import sys
import time
import json
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

import click
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint
from kaggle.api.kaggle_api_extended import KaggleApi

console = Console()

DEFAULT_NOTEBOOK = "branimirsigl/medgemma-test"
POLL_INTERVAL = 10  # seconds
MAX_POLL_TIME = 3600  # 1 hour max


class NotebookRunner:
    """Wrapper for Kaggle notebook operations using the new API."""

    def __init__(self, api: Optional[KaggleApi] = None):
        self.api = api or KaggleApi()
        self.api.authenticate()

    def parse_notebook_slug(self, slug_or_url: str) -> Tuple[str, str]:
        """Extract owner and notebook name from slug or URL."""
        # Handle full URL
        if "kaggle.com/code/" in slug_or_url:
            # https://www.kaggle.com/code/branimirsigl/medgemma-test/
            parts = slug_or_url.rstrip("/").split("/")
            owner = parts[-2]
            name = parts[-1]
            return owner, name

        # Handle slug format: owner/notebook-name
        if "/" in slug_or_url:
            owner, name = slug_or_url.split("/", 1)
            return owner, name

        raise ValueError(f"Invalid notebook slug or URL: {slug_or_url}")

    def get_kernel_metadata(self, owner: str, name: str) -> Any:
        """Get kernel metadata by owner and name."""
        kernels = self.api.kernels_list(user=owner, search=name, page_size=100)
        for kernel in kernels or []:
            if kernel.ref == f"{owner}/{name}" or kernel.slug == name:
                return kernel
        return None

    def get_notebook_status(self, owner: str, name: str) -> Dict[str, Any]:
        """Get current notebook kernel status."""
        kernel = self.get_kernel_metadata(owner, name)
        if not kernel:
            raise click.ClickException(f"Notebook not found: {owner}/{name}")

        # Get detailed status
        try:
            status = self.api.kernels_status(kernel)
            return {
                "id": getattr(kernel, "id", None),
                "ref": kernel.ref,
                "status": getattr(status, "status", "unknown"),
                "failure_message": getattr(status, "failure_message", None),
                "last_run_time": getattr(kernel, "last_run_time", None),
                "url": f"https://www.kaggle.com/code/{owner}/{name}",
            }
        except Exception as e:
            # Fallback to basic kernel info
            return {
                "id": getattr(kernel, "id", None),
                "ref": kernel.ref,
                "status": getattr(kernel, "status", "unknown"),
                "failure_message": None,
                "last_run_time": getattr(kernel, "last_run_time", None),
                "url": f"https://www.kaggle.com/code/{owner}/{name}",
            }

    def pull_notebook(self, owner: str, name: str, dest_dir: Path) -> Path:
        """Pull notebook to local directory."""
        kernel_ref = f"{owner}/{name}"
        self.api.kernels_pull(kernel_ref, str(dest_dir), metadata=True, quiet=False)
        return dest_dir

    def push_notebook(self, local_dir: Path, params: Optional[Dict] = None) -> Any:
        """Push (run) the notebook from local directory."""
        # If params provided, we need to update kernel-metadata.json
        if params:
            metadata_file = local_dir / "kernel-metadata.json"
            if metadata_file.exists():
                with open(metadata_file) as f:
                    metadata = json.load(f)
                metadata["kernel_sources"] = metadata.get("kernel_sources", [])
                # Add parameters as kernel sources or update existing
                # Note: New API handles parameters differently
                with open(metadata_file, "w") as f:
                    json.dump(metadata, f, indent=2)

        response = self.api.kernels_push(str(local_dir), timeout="600", no_run=False)
        return response

    def poll_until_complete(
        self,
        owner: str,
        name: str,
        interval: int = POLL_INTERVAL,
        max_time: int = MAX_POLL_TIME,
    ) -> Dict[str, Any]:
        """Poll notebook until completion or timeout."""
        start_time = time.time()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Waiting for notebook to complete...", total=None)

            while time.time() - start_time < max_time:
                status_info = self.get_notebook_status(owner, name)
                status = status_info["status"]

                progress.update(task, description=f"Status: {status}")

                if status in ("complete", "error", "cancelled", "failed"):
                    progress.update(task, description=f"Finished: {status}")
                    return status_info

                time.sleep(interval)

        raise click.ClickException(f"Timeout after {max_time}s. Notebook still running.")

    def download_outputs(self, owner: str, name: str, output_dir: Path) -> List[Path]:
        """Download notebook output files."""
        output_dir.mkdir(parents=True, exist_ok=True)
        kernel_ref = f"{owner}/{name}"

        try:
            # kernels_output returns (files_list, next_page_token)
            files, _ = self.api.kernels_output(kernel_ref, str(output_dir), force=True, quiet=False)
            downloaded = [output_dir / f for f in files] if files else []
            for f in downloaded:
                console.print(f"  [green]✓[/green] Downloaded: {f.name}")
            return downloaded
        except Exception as e:
            raise click.ClickException(f"Failed to download outputs: {e}")

    def get_logs(self, owner: str, name: str) -> str:
        """Get notebook logs."""
        kernel_ref = f"{owner}/{name}"
        try:
            return self.api.kernels_logs(kernel_ref)
        except Exception as e:
            return f"Error fetching logs: {e}"


@click.group()
@click.option(
    "--notebook", "-n",
    default=DEFAULT_NOTEBOOK,
    help="Notebook slug (owner/name) or full URL",
    show_default=True,
)
@click.option(
    "--kaggle-dir",
    type=click.Path(path_type=Path),
    default=Path.home() / ".kaggle",
    help="Directory containing kaggle.json or access_token",
    show_default=True,
)
@click.pass_context
def cli(ctx: click.Context, notebook: str, kaggle_dir: Path):
    """Kaggle Notebook Runner - Run notebooks from CLI."""
    ctx.ensure_object(dict)
    ctx.obj["notebook"] = notebook
    ctx.obj["kaggle_dir"] = kaggle_dir

    # Check for credentials
    kaggle_json = kaggle_dir / "kaggle.json"
    access_token = kaggle_dir / "access_token"
    if not kaggle_json.exists() and not access_token.exists():
        console.print(f"[yellow]Warning:[/yellow] No credentials found in {kaggle_dir}")
        console.print("Create kaggle.json or access_token from https://www.kaggle.com/settings/account")


@cli.command()
@click.pass_context
def status(ctx: click.Context):
    """Check notebook status."""
    notebook = ctx.obj["notebook"]
    runner = NotebookRunner()
    owner, name = runner.parse_notebook_slug(notebook)

    info = runner.get_notebook_status(owner, name)

    table = Table(title=f"Notebook: {owner}/{name}")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="white")
    table.add_row("Owner", owner)
    table.add_row("Name", name)
    table.add_row("Ref", info["ref"])
    table.add_row("Kernel ID", str(info["id"] or "N/A"))
    table.add_row("Status", f"[bold]{info['status']}[/bold]")
    table.add_row("Last Run", str(info["last_run_time"] or "Never"))
    if info["failure_message"]:
        table.add_row("Failure", f"[red]{info['failure_message']}[/red]")
    table.add_row("URL", info["url"])

    console.print(table)


@cli.command()
@click.option(
    "--param", "-p",
    multiple=True,
    help="Parameters as key=value (can use multiple times)",
)
@click.option(
    "--param-file",
    type=click.Path(path_type=Path, exists=True),
    help="JSON file with parameters",
)
@click.option(
    "--no-poll",
    is_flag=True,
    help="Don't wait for completion",
)
@click.option(
    "--poll-interval",
    type=int,
    default=POLL_INTERVAL,
    help="Polling interval in seconds",
    show_default=True,
)
@click.option(
    "--max-time",
    type=int,
    default=MAX_POLL_TIME,
    help="Maximum time to wait in seconds",
    show_default=True,
)
@click.option(
    "--output-dir", "-o",
    type=click.Path(path_type=Path),
    default=Path("./outputs"),
    help="Directory to download outputs",
    show_default=True,
)
@click.option(
    "--download/--no-download",
    default=True,
    help="Download outputs after completion",
)
@click.pass_context
def run(
    ctx: click.Context,
    param: tuple[str, ...],
    param_file: Optional[Path],
    no_poll: bool,
    poll_interval: int,
    max_time: int,
    output_dir: Path,
    download: bool,
):
    """Run the notebook with optional parameters."""
    notebook = ctx.obj["notebook"]
    runner = NotebookRunner()
    owner, name = runner.parse_notebook_slug(notebook)

    # Parse parameters
    params = {}
    for p in param:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k] = v
        else:
            console.print(f"[yellow]Ignoring invalid param:[/yellow] {p}")

    if param_file:
        with open(param_file) as f:
            file_params = json.load(f)
            params.update(file_params)

    if params:
        console.print(f"[cyan]Parameters:[/cyan] {json.dumps(params, indent=2)}")

    # Pull notebook to temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        console.print(f"[cyan]Pulling notebook {owner}/{name}...[/cyan]")
        runner.pull_notebook(owner, name, tmp_path)
        console.print(f"[green]✓[/green] Notebook pulled to {tmp_path}")

        # Run notebook
        console.print(f"[bold]Starting notebook:[/bold] {owner}/{name}")
        response = runner.push_notebook(tmp_path, params if params else None)
        console.print(f"[green]✓[/green] Notebook pushed (Response: {response})")

        if no_poll:
            console.print("Use 'status' command to check progress.")
            return

        # Poll for completion
        console.print(f"[cyan]Polling every {poll_interval}s (max {max_time}s)...[/cyan]")
        final_status = runner.poll_until_complete(
            owner, name, interval=poll_interval, max_time=max_time
        )

        status = final_status["status"]
        if status == "complete":
            console.print(Panel("[bold green]Notebook completed successfully![/bold green]"))
        elif status in ("error", "failed"):
            console.print(Panel(f"[bold red]Notebook failed:[/bold red] {final_status.get('failure_message', 'Unknown error')}"))
            sys.exit(1)
        elif status == "cancelled":
            console.print(Panel("[bold yellow]Notebook was cancelled[/bold yellow]"))
            sys.exit(1)

        # Download outputs
        if download and status == "complete":
            console.print(f"\n[cyan]Downloading outputs to {output_dir}...[/cyan]")
            downloaded = runner.download_outputs(owner, name, output_dir)
            if downloaded:
                console.print(f"[green]Downloaded {len(downloaded)} file(s)[/green]")
            else:
                console.print("[yellow]No output files found[/yellow]")


@cli.command()
@click.option(
    "--output-dir", "-o",
    type=click.Path(path_type=Path),
    default=Path("./outputs"),
    help="Directory to download outputs",
    show_default=True,
)
@click.pass_context
def download(ctx: click.Context, output_dir: Path):
    """Download outputs from last successful run."""
    notebook = ctx.obj["notebook"]
    runner = NotebookRunner()
    owner, name = runner.parse_notebook_slug(notebook)

    console.print(f"[cyan]Downloading outputs for {owner}/{name}...[/cyan]")
    downloaded = runner.download_outputs(owner, name, output_dir)

    if downloaded:
        console.print(f"[green]Downloaded {len(downloaded)} file(s)[/green]")
    else:
        console.print("[yellow]No output files found[/yellow]")


@cli.command()
@click.pass_context
def logs(ctx: click.Context):
    """Show recent notebook logs."""
    notebook = ctx.obj["notebook"]
    runner = NotebookRunner()
    owner, name = runner.parse_notebook_slug(notebook)

    console.print(f"[cyan]Fetching logs for {owner}/{name}...[/cyan]")
    logs = runner.get_logs(owner, name)
    console.print(logs)


def main():
    cli(obj={})


if __name__ == "__main__":
    main()