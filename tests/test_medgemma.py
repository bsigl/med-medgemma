#!/usr/bin/env python3
"""
Unit tests for MedGemma CLI Client.

Tests use mocked HTTP responses and do not require a real API.
"""

import os
import sys
import json
import argparse
import unittest
from unittest.mock import patch, Mock, MagicMock

# Add parent directory to path to import medgemma
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import medgemma
from medgemma import MedGemmaClient, MedGemmaError, get_config, cmd_health, cmd_ask, cmd_chat


class TestGetConfig(unittest.TestCase):
    """Tests for configuration loading."""

    def setUp(self):
        # Save original environment
        self.original_env = dict(os.environ)
        # Clear relevant env vars
        os.environ.pop('MEDGEMMA_API_URL', None)
        os.environ.pop('MEDGEMMA_API_KEY', None)

    def tearDown(self):
        # Restore original environment
        os.environ.clear()
        os.environ.update(self.original_env)

    def test_missing_api_url(self):
        """Test error when MEDGEMMA_API_URL is missing."""
        os.environ['MEDGEMMA_API_KEY'] = 'test-key'
        with self.assertRaises(MedGemmaError) as cm:
            get_config()
        self.assertIn('MEDGEMMA_API_URL', str(cm.exception))

    def test_missing_api_key(self):
        """Test error when MEDGEMMA_API_KEY is missing."""
        os.environ['MEDGEMMA_API_URL'] = 'https://test.ngrok-free.app'
        with self.assertRaises(MedGemmaError) as cm:
            get_config()
        self.assertIn('MEDGEMMA_API_KEY', str(cm.exception))

    def test_invalid_url_not_https(self):
        """Test error when URL doesn't use HTTPS."""
        os.environ['MEDGEMMA_API_URL'] = 'http://test.ngrok-free.app'
        os.environ['MEDGEMMA_API_KEY'] = 'test-key'
        with self.assertRaises(MedGemmaError) as cm:
            get_config()
        self.assertIn('HTTPS', str(cm.exception))

    def test_valid_config(self):
        """Test successful config loading."""
        os.environ['MEDGEMMA_API_URL'] = 'https://test.ngrok-free.app'
        os.environ['MEDGEMMA_API_KEY'] = 'test-key'
        url, key = get_config()
        self.assertEqual(url, 'https://test.ngrok-free.app')
        self.assertEqual(key, 'test-key')


class TestMedGemmaClient(unittest.TestCase):
    """Tests for MedGemmaClient class."""

    def setUp(self):
        self.api_url = 'https://test.ngrok-free.app'
        self.api_key = 'test-api-key'
        self.client = MedGemmaClient(self.api_url, self.api_key, timeout=30)

    @patch('medgemma.requests.Session.get')
    def test_health_success(self, mock_get):
        """Test successful health check."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ready',
            'model': 'MedGemma 4B',
            'gpu': 'NVIDIA T4'
        }
        mock_get.return_value = mock_response

        result = self.client.health()

        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['model'], 'MedGemma 4B')
        self.assertEqual(result['gpu'], 'NVIDIA T4')
        mock_get.assert_called_once_with(
            'https://test.ngrok-free.app/health',
            timeout=30
        )

    @patch('medgemma.requests.Session.get')
    def test_health_http_401(self, mock_get):
        """Test health check with HTTP 401."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {'detail': 'Unauthorized'}
        mock_get.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('401', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_http_404(self, mock_get):
        """Test health check with HTTP 404."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.json.return_value = {'detail': 'Not Found'}
        mock_get.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('404', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_http_429(self, mock_get):
        """Test health check with HTTP 429."""
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.json.return_value = {'detail': 'Too Many Requests'}
        mock_get.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('429', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_http_500(self, mock_get):
        """Test health check with HTTP 500."""
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.json.return_value = {'detail': 'Internal Server Error'}
        mock_get.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('500', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_timeout(self, mock_get):
        """Test health check timeout."""
        import requests
        mock_get.side_effect = requests.exceptions.Timeout()

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('timed out', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_ssl_error(self, mock_get):
        """Test health check SSL error."""
        import requests
        mock_get.side_effect = requests.exceptions.SSLError('certificate verify failed')

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('SSL/TLS', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_connection_error(self, mock_get):
        """Test health check connection error."""
        import requests
        mock_get.side_effect = requests.exceptions.ConnectionError('connection refused')

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('Connection failed', str(cm.exception))

    @patch('medgemma.requests.Session.get')
    def test_health_invalid_json(self, mock_get):
        """Test health check with invalid JSON response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.side_effect = json.JSONDecodeError('Expecting value', '', 0)
        mock_get.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.health()
        self.assertIn('Invalid JSON', str(cm.exception))

    @patch('medgemma.requests.Session.post')
    def test_generate_success(self, mock_post):
        """Test successful generation."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'response': 'Iron deficiency causes anemia...'
        }
        mock_post.return_value = mock_response

        result = self.client.generate('What is iron deficiency?', max_new_tokens=300)

        self.assertEqual(result, 'Iron deficiency causes anemia...')
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        self.assertEqual(call_args[0][0], 'https://test.ngrok-free.app/generate')
        self.assertEqual(call_args[1]['json']['prompt'], 'What is iron deficiency?')
        self.assertEqual(call_args[1]['json']['max_new_tokens'], 300)

    @patch('medgemma.requests.Session.post')
    def test_generate_missing_response_field(self, mock_post):
        """Test generation with missing 'response' field."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'text': 'some text'}
        mock_post.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.generate('test prompt')
        self.assertIn('missing', str(cm.exception).lower())

    @patch('medgemma.requests.Session.post')
    def test_generate_http_401(self, mock_post):
        """Test generation with HTTP 401."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {'detail': 'Invalid API key'}
        mock_post.return_value = mock_response

        with self.assertRaises(MedGemmaError) as cm:
            self.client.generate('test')
        self.assertIn('401', str(cm.exception))

    @patch('medgemma.requests.Session.post')
    def test_generate_timeout(self, mock_post):
        """Test generation timeout."""
        import requests
        mock_post.side_effect = requests.exceptions.Timeout()

        with self.assertRaises(MedGemmaError) as cm:
            self.client.generate('test')
        self.assertIn('timed out', str(cm.exception))

    @patch('medgemma.requests.Session.post')
    def test_generate_ssl_error(self, mock_post):
        """Test generation SSL error."""
        import requests
        mock_post.side_effect = requests.exceptions.SSLError('bad certificate')

        with self.assertRaises(MedGemmaError) as cm:
            self.client.generate('test')
        self.assertIn('SSL/TLS', str(cm.exception))


class TestCommands(unittest.TestCase):
    """Tests for command handlers."""

    def setUp(self):
        self.original_env = dict(os.environ)
        os.environ['MEDGEMMA_API_URL'] = 'https://test.ngrok-free.app'
        os.environ['MEDGEMMA_API_KEY'] = 'test-key'

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.original_env)

    @patch('medgemma.MedGemmaClient.health')
    def test_cmd_health_success(self, mock_health):
        """Test health command success."""
        mock_health.return_value = {
            'status': 'ready',
            'model': 'MedGemma 4B',
            'gpu': 'NVIDIA T4'
        }

        args = argparse.Namespace(show_progress=True)
        result = cmd_health(args)
        self.assertEqual(result, 0)

    @patch('medgemma.MedGemmaClient.health')
    def test_cmd_health_error(self, mock_health):
        """Test health command error."""
        mock_health.side_effect = MedGemmaError('API unavailable')

        args = argparse.Namespace(show_progress=True)
        result = cmd_health(args)
        self.assertEqual(result, 1)

    @patch('medgemma.MedGemmaClient.generate')
    def test_cmd_ask_success(self, mock_generate):
        """Test ask command success."""
        mock_generate.return_value = 'Test response'

        args = argparse.Namespace(prompt='Test question', max_new_tokens=512, show_progress=True)
        result = cmd_ask(args)
        self.assertEqual(result, 0)
        mock_generate.assert_called_once_with('Test question', 512, True)

    @patch('medgemma.MedGemmaClient.generate')
    def test_cmd_ask_error(self, mock_generate):
        """Test ask command error."""
        mock_generate.side_effect = MedGemmaError('Generation failed')

        args = argparse.Namespace(prompt='Test question', max_new_tokens=512, show_progress=True)
        result = cmd_ask(args)
        self.assertEqual(result, 1)


class TestArgumentParsing(unittest.TestCase):
    """Tests for argument parsing."""

    def test_health_command(self):
        """Test health command parsing."""
        import argparse
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest='command', required=True)
        subparsers.add_parser('health')

        args = parser.parse_args(['health'])
        self.assertEqual(args.command, 'health')

    def test_ask_command(self):
        """Test ask command parsing."""
        import argparse
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest='command', required=True)
        ask_parser = subparsers.add_parser('ask')
        ask_parser.add_argument('prompt')
        ask_parser.add_argument('--max-new-tokens', type=int, default=512)

        args = parser.parse_args(['ask', 'test question', '--max-new-tokens', '300'])
        self.assertEqual(args.command, 'ask')
        self.assertEqual(args.prompt, 'test question')
        self.assertEqual(args.max_new_tokens, 300)

    def test_ask_command_default_tokens(self):
        """Test ask command with default tokens."""
        import argparse
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest='command', required=True)
        ask_parser = subparsers.add_parser('ask')
        ask_parser.add_argument('prompt')
        ask_parser.add_argument('--max-new-tokens', type=int, default=512)

        args = parser.parse_args(['ask', 'test question'])
        self.assertEqual(args.max_new_tokens, 512)

    def test_chat_command(self):
        """Test chat command parsing."""
        import argparse
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest='command', required=True)
        chat_parser = subparsers.add_parser('chat')
        chat_parser.add_argument('--max-new-tokens', type=int, default=512)

        args = parser.parse_args(['chat', '--max-new-tokens', '200'])
        self.assertEqual(args.command, 'chat')
        self.assertEqual(args.max_new_tokens, 200)


if __name__ == '__main__':
    unittest.main()