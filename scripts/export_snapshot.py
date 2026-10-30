"""Export WebSOC to a validated, atomic JSON snapshot; no cloud credentials needed."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from websoc.parse import parse_document

SOURCE = 'https://www.reg.uci.edu/perl/WebSoc'
DAYS = ['su', 'm', 'tu', 'w', 'th', 'f', 'sa']
EXCLUDED = {'on', 'vrtl', 'online', 'tba', '-', '@', 'off'}

def fetch(term, start, end):
    url = f'{SOURCE}?YearTerm={term}&CourseCodes={start}-{end}&Submit=Text'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                document = response.read().decode(response.headers.get_content_charset() or 'utf-8')
            time.sleep(0.6)
            if 'Whoa pardner' in document:
                raise RuntimeError('WebSOC rate limit: snapshot was not replaced')
            return document
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** (attempt + 1))

def documents(term, start=0, end=99999):
    document = fetch(term, start, end)
    if 'please refine your search' in document:
        if start >= end:
            raise ValueError('A single course response was truncated')
        middle = (start + end) // 2
        yield from documents(term, start, middle)
        yield from documents(term, middle + 1, end)
    elif 'No courses matched' not in document:
        if 'Total Classes Displayed:' not in document or '###' not in document:
            raise ValueError('Unexpected WebSOC response; existing snapshot retained')
        yield document

def merge(intervals):
    merged = []
    for start, end in sorted(intervals):
        start, end = round(start * 60), round(end * 60)
        if not 0 <= start < end <= 1440:
            raise ValueError(f'Invalid meeting time: {start}, {end}')
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged

def export(term, output):
    database, batches, sections = {}, 0, 0
    for document in documents(term):
        parse_document(database, document, term)
        batches += 1
        sections += int(re.search(r'Total Classes Displayed:\s*(\d+)', document)[1])
        print(f'Fetched batch {batches}; {sum(map(len, database.values()))} room records', flush=True)
    rooms = []
    for building, entries in sorted(database.items()):
        if building in EXCLUDED:
            continue
        for number, entry in sorted(entries.items()):
            if number in {'null', 'tba', 'online'}:
                continue
            rooms.append({'id': f'{building}-{number}', 'building': building, 'number': number.upper(),
                          'schedule': [merge(entry[day]) for day in DAYS]})
    if not rooms or not any(any(room['schedule']) for room in rooms):
        raise ValueError('Empty snapshot; existing snapshot retained')
    payload = {'metadata': {'term': term, 'fetchedAt': datetime.now(timezone.utc).isoformat(),
                           'source': SOURCE, 'bufferMinutes': 10, 'batches': batches, 'sections': sections}, 'rooms': rooms}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':')) + '\n')
    temporary.replace(output)
    print(f'Saved {len(rooms)} scheduled rooms to {output}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--term', default='2026-92')
    parser.add_argument('--output', type=Path, default=ROOT / '.runtime/legacy-snapshot.json')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}-(03|14|25|39|76|92)', args.term):
        parser.error('Use a WebSOC term such as 2026-92')
    export(args.term, args.output)
