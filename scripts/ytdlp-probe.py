"""Download one caption track to a temporary directory; print counts, never text."""
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import time

video_id = sys.argv[1] if len(sys.argv) > 1 else ''
language = sys.argv[2] if len(sys.argv) > 2 else 'en'
if not re.fullmatch(r'[\w-]{11}', video_id) or not re.fullmatch(r'[A-Za-z0-9-]{2,35}', language):
    sys.exit('Usage: yt-dlp-probe VIDEO_ID [language; default en]')
started = time.monotonic()
with tempfile.TemporaryDirectory() as directory:
    args = ['yt-dlp', '--ignore-config', '--no-playlist', '--no-cache-dir',
            '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', language,
            '--sub-format', 'json3', '--socket-timeout', '15', '--retries', '0',
            '--extractor-retries', '0', '--js-runtimes', 'node',
            '-o', str(pathlib.Path(directory) / '%(id)s.%(ext)s'),
            '--', 'https://www.youtube.com/watch?v=' + video_id]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=60)
        if result.returncode:
            message = result.stderr.lower()
            code = 'UPSTREAM_BLOCKED' if 'not a bot' in message or '429' in message else 'RETRIEVAL_FAILED'
            print(json.dumps({'backend': 'yt-dlp', 'status': 'failed', 'code': code}))
            sys.exit(1)
        files = list(pathlib.Path(directory).glob('*.json3'))
        events = [event for file in files for event in json.loads(file.read_text()).get('events', []) if event.get('segs')]
        text = ''.join(segment.get('utf8', '') for event in events for segment in event['segs'])
        if not text.strip():
            print(json.dumps({'backend': 'yt-dlp', 'status': 'failed', 'code': 'NO_CAPTIONS_FOR_LANGUAGE'}))
            sys.exit(1)
        print(json.dumps({'backend': 'yt-dlp', 'status': 'retrieved', 'videoId': video_id,
                          'languageCode': language, 'segments': len(events), 'bytes': len(text.encode()),
                          'lastEndSeconds': max((e.get('tStartMs', 0) + e.get('dDurationMs', 0)) / 1000 for e in events),
                          'elapsedMs': round((time.monotonic() - started) * 1000)}))
    except subprocess.TimeoutExpired:
        print(json.dumps({'backend': 'yt-dlp', 'status': 'failed', 'code': 'TIMEOUT'}))
        sys.exit(1)
