"""Normalize a single provider's schedules into dated classroom rules."""
from datetime import date, datetime, timedelta, timezone
import re
import uuid

QUARTERS = {'Winter': '03', 'Spring': '14', 'Summer1': '25', 'Summer10wk': '39', 'Summer2': '76', 'Fall': '92'}
EXCLUDED = {'ON', 'VRTL', 'ONLINE', 'TBA', 'OFF', 'REMOTE', 'VIRTUAL', '-', '@'}
DAY_PATTERN = re.compile(r'Su|Sa|Tu|Th|M|W|F')
DAYS = {'Su': 0, 'M': 1, 'Tu': 2, 'W': 3, 'Th': 4, 'F': 5, 'Sa': 6}


def term_id(term):
    return f"{term['year']}-{QUARTERS[term['quarter']]}"


def sunday(day):
    return day - timedelta(days=(day.weekday() + 1) % 7)


def calendar_terms(records):
    result = []
    for row in records:
        if row.get('quarter') not in QUARTERS:
            continue
        term = {k: str(row[k]) for k in ('year', 'quarter', 'instructionStart', 'instructionEnd', 'finalsStart', 'finalsEnd', 'socAvailable')}
        for key in ('instructionStart', 'instructionEnd', 'finalsStart', 'finalsEnd', 'socAvailable'):
            date.fromisoformat(term[key])
        if not term['instructionStart'] <= term['instructionEnd'] <= term['finalsEnd'] or term['finalsStart'] > term['finalsEnd']:
            raise ValueError('Invalid academic calendar dates')
        term['id'] = term_id(term)
        result.append(term)
    if not result or len({t['id'] for t in result}) != len(result):
        raise ValueError('Invalid or duplicate academic terms')
    return sorted(result, key=lambda t: t['instructionStart'])


def select_terms(calendar, today, overrides=None):
    # Include every published upcoming term, not just terms currently teaching.
    chosen = [t for t in calendar if t['socAvailable'] <= today.isoformat() and t['finalsEnd'] >= today.isoformat()]
    if overrides:
        chosen = [t for t in calendar if t['id'] in overrides]
        if {t['id'] for t in chosen} != set(overrides):
            raise ValueError('Term override has no validated calendar entry')
    if not chosen:
        raise ValueError('No published current or upcoming terms')
    return chosen


def location(value):
    value = re.sub(r'\s+', ' ', str(value)).strip()
    if not value or value.upper() in EXCLUDED:
        return None
    # Match from the end so multiword building names keep stable legacy IDs.
    match = re.fullmatch(r'(.+?)\s+([\w-]+)', value)
    if not match or match[1].upper() in EXCLUDED or match[2].upper() in EXCLUDED:
        return None
    building, number = match[1].lower(), match[2].upper()
    if building == 'uci' and number in {'BARN', 'MC'}:
        return (f'uci-{number.lower()}', 'uci', number)
    building = building.replace(' ', '-')
    return (f'{building}-{number.lower()}', building, number)


def minute(value):
    hour, mins = value['hour'], value['minute']
    if type(hour) is not int or type(mins) is not int or not 0 <= hour <= 23 or not 0 <= mins <= 59:
        raise ValueError('Invalid provider time')
    return hour * 60 + mins


def span(item):
    start, end = minute(item['startTime']), minute(item['endTime'])
    if start >= end:
        raise ValueError('Invalid provider interval')
    return start, min(1440, end + 10)


def normalize(terms, responses, today, now=None):
    rooms, section_count = {}, 0
    def room_at(place):
        parsed = location(place)
        if not parsed:
            return None
        ident, building, number = parsed
        return rooms.setdefault(ident, {'id': ident, 'building': building, 'number': number,
                                        'meetings': [], 'exams': [], 'uncertainFinals': [], 'terms': []})
    for term in terms:
        payload = responses[term['id']]
        if not isinstance(payload.get('schools'), list) or not payload['schools']:
            raise ValueError('Incomplete provider term response')
        term_sections = 0
        for school in payload['schools']:
            for department in school['departments']:
                for course in department['courses']:
                    for section in course['sections']:
                        if section.get('isCancelled') or section.get('status', '').lower() in {'cancelled', 'canceled'}:
                            continue
                        section_count += 1
                        term_sections += 1
                        associated = set()
                        for meeting in section['meetings']:
                            if meeting.get('timeIsTBA'):
                                continue
                            days = [DAYS[d] for d in DAY_PATTERN.findall(meeting['days'])]
                            if not days or ''.join(DAY_PATTERN.findall(meeting['days'])) != meeting['days']:
                                raise ValueError('Unrecognized meeting days')
                            start, end = span(meeting)
                            for place in meeting['bldg']:
                                room = room_at(place)
                                if room is None:
                                    continue
                                associated.add(room['id'])
                                rule = {'term': term['id'], 'days': sorted(set(days)), 'start': start, 'end': end}
                                if rule not in room['meetings']:
                                    room['meetings'].append(rule)
                        exam = section['finalExam']
                        if exam['examStatus'] == 'SCHEDULED_FINAL':
                            # Anteater API uses zero-based JS months; civil times are Pacific.
                            exam_day = date(int(term['year']), exam['month'] + 1, exam['day'])
                            if not term['instructionStart'] <= exam_day.isoformat() <= term['finalsEnd']:
                                raise ValueError('Exam date outside its term')
                            start, end = span(exam)
                            located = False
                            for place in exam.get('bldg', []):
                                room = room_at(place)
                                if room is None:
                                    continue
                                associated.add(room['id'])
                                event = {'term': term['id'], 'date': exam_day.isoformat(), 'start': start, 'end': end}
                                if event not in room['exams']:
                                    room['exams'].append(event)
                                located = True
                            if not located:
                                for ident in associated:
                                    rooms[ident]['uncertainFinals'].append(term['id'])
                        elif exam['examStatus'] == 'TBA_FINAL':
                            for ident in associated:
                                rooms[ident]['uncertainFinals'].append(term['id'])
                        elif exam['examStatus'] != 'NO_FINAL':
                            raise ValueError('Unknown final exam status')
                        for ident in associated:
                            if term['id'] not in rooms[ident]['terms']:
                                rooms[ident]['terms'].append(term['id'])
        if not term_sections:
            raise ValueError('Unexpectedly empty published term')
    if not rooms:
        raise ValueError('No physical classroom schedules')
    active = [t for t in terms if t['instructionStart'] <= today.isoformat() <= t['finalsEnd']]
    start = sunday(min([today] + [date.fromisoformat(t['instructionStart']) for t in terms if t['instructionStart'] <= today.isoformat()]))
    end = sunday(max(date.fromisoformat(t['finalsEnd']) for t in terms)) + timedelta(days=6)
    for room in rooms.values():
        room['uncertainFinals'] = sorted(set(room['uncertainFinals']))
        room['meetings'].sort(key=lambda m: (m['term'], m['days'], m['start']))
        room['exams'].sort(key=lambda e: (e['date'], e['start']))
    return {'schemaVersion': 2, 'metadata': {
        'term': (active or terms)[0]['id'], 'terms': [t['id'] for t in terms],
        'fetchedAt': (now or datetime.now(timezone.utc)).isoformat(),
        'source': 'https://anteaterapi.com', 'bufferMinutes': 10, 'sections': section_count,
        'batches': len(responses), 'publicationId': uuid.uuid4().hex, 'mode': 'live',
        'dateRange': {'start': start.isoformat(), 'end': end.isoformat()},
    }, 'terms': terms, 'rooms': sorted(rooms.values(), key=lambda r: r['id'])}
