# MedGemma CLI Client

A simple, reliable Python CLI application for interacting with a remote MedGemma 4B API running in Kaggle and exposed through an ngrok HTTPS tunnel.

## Features

- **Health Check** - Verify API availability and view model/GPU info
- **Single Question** - Ask one-off questions with configurable token limits
- **Interactive Chat** - Multi-turn conversation session (stateless per request)
- **Progress Spinner** - Visual feedback during long-running requests
- **Secure** - API key from environment variables, HTTPS only, no secrets in logs

## Requirements

- Python 3.11+
- `requests` library

## Installation

```bash
# Clone or navigate to the project directory
cd medgemma-cli

# Create virtual environment
python3 -m venv .venv

# Activate it
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Configuration

Set the required environment variables:

```bash
export MEDGEMMA_API_URL="https://your-ngrok-address.ngrok-free.app"
export MEDGEMMA_API_KEY="your-api-key"
```

**Important:**
- The ngrok URL may be temporary and only works while the Kaggle session is active
- Never hardcode the API key in source code or commit it to Git
- Use HTTPS exclusively (enforced by the client)

## Usage

### Health Check

```bash
python3 medgemma.py health
```

Output example:
```
API Status: OK
Model: MedGemma 4B
GPU: NVIDIA T4
Status: ready
```

### Ask a Single Question

```bash
python3 medgemma.py ask "Explain the difference between iron and vitamin B12 deficiency."
```

With custom token limit:
```bash
python3 medgemma.py ask "Explain the difference between iron and vitamin B12 deficiency." --max-new-tokens 300
```

Disable progress spinner:
```bash
python3 medgemma.py ask "What is iron deficiency?" --no-progress
```

### Interactive Chat

```bash
python3 medgemma.py chat
```

Example session:
```
MedGemma Interactive Chat
==================================================
Note: The remote API does not retain conversation history.
Each question is independent unless context is explicitly added.
Type 'exit' or 'quit' to exit, or press Ctrl+C.
==================================================

You: What are the symptoms of iron deficiency?
⠋ Generating response...
MedGemma: Iron deficiency symptoms include fatigue, weakness, pale skin...

You: And for B12 deficiency?
⠋ Generating response...
MedGemma: Vitamin B12 deficiency can cause neurological symptoms...

You: quit
Goodbye!
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `health` | Check API availability and display status |
| `ask "question"` | Ask a single question |
| `chat` | Start interactive chat session |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--max-new-tokens N` | Maximum tokens to generate | 512 |
| `--no-progress` | Disable progress spinner | progress enabled |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MEDGEMMA_API_URL` | Yes | Base API URL (must use HTTPS) |
| `MEDGEMMA_API_KEY` | Yes | API key for authentication |

## Error Handling

The client handles:
- Missing configuration (clear setup instructions)
- Invalid/unauthorized API keys (HTTP 401)
- Not found endpoints (HTTP 404)
- Rate limiting (HTTP 429)
- Server errors (HTTP 500+)
- Connection failures
- SSL/TLS certificate errors
- Request timeouts (180s default)
- Invalid JSON responses
- Missing response fields

## Security Considerations

- ✅ Uses HTTPS exclusively
- ✅ TLS certificate verification enabled
- ✅ API key from environment variables only
- ✅ No API key in command-line arguments
- ✅ No API key logging
- ✅ No automatic file uploads
- ✅ No command execution from model output
- ⚠️ ngrok URLs are temporary — API only works while Kaggle session is active
- ⚠️ Each request is independent (no conversation history retained by default)

## Testing

Run the test suite (does not require a real API):

```bash
python3 -m unittest tests.test_medgemma -v
```

## Project Structure

```
medgemma-cli/
├── medgemma.py       # Main CLI application
├── requirements.txt  # Python dependencies
├── README.md         # This file
├── .gitignore        # Git ignore rules
├── .env.example      # Environment variable template
└── tests/
    └── test_medgemma.py  # Unit tests with mocked HTTP
```

## License

MIT License