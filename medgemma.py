#!/usr/bin/env python3
"""
MedGemma CLI Client

A simple command-line interface for interacting with a remote MedGemma 4B API
exposed through an ngrok HTTPS tunnel.

Environment Variables:
    MEDGEMMA_API_URL    - Base API URL (e.g., https://xxxx.ngrok-free.app)
    MEDGEMMA_API_KEY    - API key for authentication

Commands:
    health              - Check API availability and display status
    ask "question"      - Ask a single question
    chat                - Start an interactive chat session
"""

import os
import sys
import json
import argparse
import requests
import threading
import time
import itertools
from typing import Optional, Dict, Any

from dotenv import load_dotenv

load_dotenv()


# Default configuration
DEFAULT_MAX_NEW_TOKENS = 512
DEFAULT_TIMEOUT = 180  # seconds


class Spinner:
    """Simple spinner animation for long-running requests."""
    
    def __init__(self, message: str = "Generating response"):
        self.message = message
        self.spinner_chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
    
    def start(self):
        """Start the spinner animation."""
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()
    
    def stop(self):
        """Stop the spinner animation."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=0.5)
        # Clear the spinner line
        sys.stdout.write('\r' + ' ' * (len(self.message) + 10) + '\r')
        sys.stdout.flush()
    
    def _spin(self):
        """Internal spin loop."""
        for char in itertools.cycle(self.spinner_chars):
            if self._stop_event.is_set():
                break
            sys.stdout.write(f'\r{char} {self.message}...')
            sys.stdout.flush()
            time.sleep(0.1)


class MedGemmaClient:
    """Client for interacting with the MedGemma API."""

    def __init__(self, api_url: str, api_key: str, timeout: int = DEFAULT_TIMEOUT):
        """
        Initialize the client.

        Args:
            api_url: Base URL of the MedGemma API (e.g., https://xxxx.ngrok-free.app)
            api_key: API key for authentication
            timeout: Request timeout in seconds
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })

    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """Handle HTTP response, raising appropriate exceptions for errors."""
        try:
            data = response.json()
        except json.JSONDecodeError:
            raise MedGemmaError(f"Invalid JSON response (HTTP {response.status_code})")

        if response.status_code == 200:
            return data
        elif response.status_code == 401:
            raise MedGemmaError("Invalid or unauthorized API key (HTTP 401)")
        elif response.status_code == 404:
            raise MedGemmaError("Endpoint not found (HTTP 404). Check the API URL.")
        elif response.status_code == 429:
            raise MedGemmaError("Too many requests (HTTP 429). Please wait and try again.")
        elif response.status_code >= 500:
            raise MedGemmaError(f"Server error (HTTP {response.status_code})")
        else:
            error_msg = data.get('detail') or data.get('message') or f"HTTP {response.status_code}"
            raise MedGemmaError(f"Request failed: {error_msg}")

    def health(self) -> Dict[str, Any]:
        """
        Check API health.

        Returns:
            Dictionary with health information.

        Raises:
            MedGemmaError: If the request fails.
        """
        url = f"{self.api_url}/health"
        try:
            response = self.session.get(url, timeout=self.timeout)
        except requests.exceptions.Timeout:
            raise MedGemmaError(f"Request timed out after {self.timeout} seconds")
        except requests.exceptions.SSLError as e:
            raise MedGemmaError(f"SSL/TLS certificate verification failed: {e}")
        except requests.exceptions.ConnectionError as e:
            raise MedGemmaError(f"Connection failed: {e}")
        except requests.exceptions.RequestException as e:
            raise MedGemmaError(f"Request failed: {e}")

        return self._handle_response(response)

    def generate(self, prompt: str, max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS, show_progress: bool = True) -> str:
        """
        Generate a response from the model.

        Args:
            prompt: The question/prompt for the model.
            max_new_tokens: Maximum number of tokens to generate.
            show_progress: Whether to show a spinner during generation.

        Returns:
            The model's response text.

        Raises:
            MedGemmaError: If the request fails or response is invalid.
        """
        url = f"{self.api_url}/generate"
        payload = {
            "prompt": prompt,
            "max_new_tokens": max_new_tokens,
        }

        spinner = Spinner("Generating response") if show_progress else None
        if spinner:
            spinner.start()

        try:
            response = self.session.post(url, json=payload, timeout=self.timeout)
        except requests.exceptions.Timeout:
            if spinner:
                spinner.stop()
            raise MedGemmaError(f"Request timed out after {self.timeout} seconds")
        except requests.exceptions.SSLError as e:
            if spinner:
                spinner.stop()
            raise MedGemmaError(f"SSL/TLS certificate verification failed: {e}")
        except requests.exceptions.ConnectionError as e:
            if spinner:
                spinner.stop()
            raise MedGemmaError(f"Connection failed: {e}")
        except requests.exceptions.RequestException as e:
            if spinner:
                spinner.stop()
            raise MedGemmaError(f"Request failed: {e}")
        finally:
            if spinner:
                spinner.stop()

        data = self._handle_response(response)

        if 'response' not in data:
            raise MedGemmaError("Invalid response: missing 'response' field")

        return data['response']


class MedGemmaError(Exception):
    """Custom exception for MedGemma client errors."""
    pass


def get_config() -> tuple[str, str]:
    """
    Get API URL and key from environment variables.

    Returns:
        Tuple of (api_url, api_key).

    Raises:
        MedGemmaError: If required environment variables are missing.
    """
    api_url = os.environ.get('MEDGEMMA_API_URL')
    api_key = os.environ.get('MEDGEMMA_API_KEY')

    if not api_url:
        raise MedGemmaError(
            "Missing MEDGEMMA_API_URL environment variable.\n"
            "Set it to your ngrok HTTPS URL, e.g.:\n"
            '  export MEDGEMMA_API_URL="https://your-address.ngrok-free.app"'
        )

    if not api_key:
        raise MedGemmaError(
            "Missing MEDGEMMA_API_KEY environment variable.\n"
            "Set it to your API key, e.g.:\n"
            '  export MEDGEMMA_API_KEY="your-api-key"'
        )

    if not api_url.startswith('https://'):
        raise MedGemmaError("MEDGEMMA_API_URL must use HTTPS")

    return api_url, api_key


def cmd_health(args: argparse.Namespace) -> int:
    """Handle the 'health' command."""
    try:
        api_url, api_key = get_config()
        client = MedGemmaClient(api_url, api_key)
        
        spinner = Spinner("Checking API health") if getattr(args, 'show_progress', True) else None
        if spinner:
            spinner.start()
        
        try:
            data = client.health()
        finally:
            if spinner:
                spinner.stop()

        print("API Status: OK")
        if 'model' in data:
            print(f"Model: {data['model']}")
        if 'gpu' in data:
            print(f"GPU: {data['gpu']}")
        if 'status' in data:
            print(f"Status: {data['status']}")

        # Print any other fields
        for key, value in data.items():
            if key not in ('model', 'gpu', 'status'):
                print(f"{key.capitalize()}: {value}")

        return 0

    except MedGemmaError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_ask(args: argparse.Namespace) -> int:
    """Handle the 'ask' command."""
    try:
        api_url, api_key = get_config()
        client = MedGemmaClient(api_url, api_key)
        show_progress = getattr(args, 'show_progress', True)
        response = client.generate(args.prompt, args.max_new_tokens, show_progress)
        print(response)
        return 0

    except MedGemmaError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_chat(args: argparse.Namespace) -> int:
    """Handle the 'chat' command."""
    try:
        api_url, api_key = get_config()
        client = MedGemmaClient(api_url, api_key)

        print("MedGemma Interactive Chat")
        print("=" * 50)
        print("Note: The remote API does not retain conversation history.")
        print("Each question is independent unless context is explicitly added.")
        print("Type 'exit' or 'quit' to exit, or press Ctrl+C.")
        print("=" * 50)

        show_progress = getattr(args, 'show_progress', True)

        while True:
            try:
                prompt = input("\nYou: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                return 0

            if prompt.lower() in ('exit', 'quit'):
                print("Goodbye!")
                return 0

            if not prompt:
                continue

            try:
                response = client.generate(prompt, args.max_new_tokens, show_progress)
                print(f"\nMedGemma: {response}")
            except MedGemmaError as e:
                print(f"\nError: {e}", file=sys.stderr)

    except MedGemmaError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog='medgemma',
        description='CLI client for remote MedGemma 4B API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  medgemma health
  medgemma ask "What is the treatment for iron deficiency anemia?"
  medgemma ask "Explain B12 deficiency" --max-new-tokens 300
  medgemma chat

Environment Variables:
  MEDGEMMA_API_URL   Base API URL (required)
  MEDGEMMA_API_KEY   API key for authentication (required)

Note: The ngrok URL may be temporary. The API works only while the
Kaggle session remains active.
        """
    )

    subparsers = parser.add_subparsers(dest='command', required=True)

    # common options for all commands
    def add_common_args(parser):
        parser.add_argument(
            '--no-progress',
            action='store_false',
            dest='show_progress',
            default=True,
            help='Disable progress spinner'
        )

    # health command
    health_parser = subparsers.add_parser('health', help='Check API health and status')
    add_common_args(health_parser)

    # ask command
    ask_parser = subparsers.add_parser('ask', help='Ask a single question')
    add_common_args(ask_parser)
    ask_parser.add_argument('prompt', help='Question for the model')
    ask_parser.add_argument(
        '--max-new-tokens',
        type=int,
        default=DEFAULT_MAX_NEW_TOKENS,
        help=f'Maximum tokens to generate (default: {DEFAULT_MAX_NEW_TOKENS})'
    )

    # chat command
    chat_parser = subparsers.add_parser('chat', help='Start interactive chat')
    add_common_args(chat_parser)
    chat_parser.add_argument(
        '--max-new-tokens',
        type=int,
        default=DEFAULT_MAX_NEW_TOKENS,
        help=f'Maximum tokens to generate per response (default: {DEFAULT_MAX_NEW_TOKENS})'
    )

    args = parser.parse_args()

    if args.command == 'health':
        return cmd_health(args)
    elif args.command == 'ask':
        return cmd_ask(args)
    elif args.command == 'chat':
        return cmd_chat(args)
    else:
        parser.print_help()
        return 1


if __name__ == '__main__':
    sys.exit(main())