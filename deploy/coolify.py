"""Provision and inspect Antscoper using an existing Coolify GitHub App.

Credentials are read from --key-file (default: ../coolify_api_key.txt). Resource
identifiers are saved to ignored .secrets/coolify.json; no tokens are stored there.
"""
import argparse
import json
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['configure', 'status', 'deploy', 'enable-auto'])
    parser.add_argument('--key-file', type=Path, default=ROOT.parent / 'coolify_api_key.txt')
    parser.add_argument('--base', default='https://coolify.internal.gdodge.dev')
    parser.add_argument('--server', default='qd6at0pkjdbcefaa3z15onu5')
    parser.add_argument('--github-app', type=int, default=1)
    args = parser.parse_args()
    token = args.key_file.read_text().strip()
    def api(path, method='GET', body=None):
        request = urllib.request.Request(args.base.rstrip('/') + '/api/v1/' + path,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Content-Type': 'application/json'},
            method=method, data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            # Validation field names are useful; do not print resource bodies.
            try: fields = list(json.loads(error.read()).get('errors', {}))
            except ValueError: fields = []
            raise RuntimeError(f'{method} {path}: HTTP {error.code}; validation fields: {fields}') from None
    state_path = ROOT / '.secrets/coolify.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    def save():
        state_path.parent.mkdir(mode=0o700, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=2) + '\n')
        state_path.chmod(0o600)
    if args.command == 'configure':
        projects = api('projects')
        project = next((p for p in projects if p['name'] == 'Antscoper'), None)
        if not project:
            project = api('projects', 'POST', {'name': 'Antscoper', 'description': 'Dated UCI classroom availability'})
        state['project'] = project['uuid']; save()
        environments = api(f"projects/{state['project']}/environments")
        environment = next((e for e in environments if e['name'] == 'production'), None)
        if not environment:
            environment = api(f"projects/{state['project']}/environments", 'POST', {'name': 'production'})
        state['environment'] = environment['uuid']; save()
        github = next(a for a in api('github-apps') if a['id'] == args.github_app)
        existing = next((a for a in api('applications') if a['git_repository'] == 'gdodge0/antscoper-revamped'), None)
        payload = {'name': 'antscoper', 'git_repository': 'gdodge0/antscoper-revamped', 'git_branch': 'main',
                   'build_pack': 'dockercompose', 'base_directory': '/', 'docker_compose_location': '/compose.yaml',
                   'docker_compose_domains': [{'name': 'web', 'domain': 'https://antscoper.gdodge.dev:8080'}],
                   'ports_exposes': '8080', 'is_auto_deploy_enabled': False,
                   'include_source_commit_in_build': True, 'inject_build_args_to_dockerfile': True,
                   'redact_all_env_values_in_logs': True, 'is_preview_deployments_enabled': False}
        if existing:
            state['application'] = existing['uuid']
            api('applications/' + state['application'], 'PATCH', payload)
        else:
            result = api('applications/private-github-app', 'POST', {
                **payload, 'project_uuid': state['project'], 'environment_uuid': state['environment'],
                'server_uuid': args.server, 'github_app_uuid': github['uuid'], 'instant_deploy': False})
            state['application'] = result['uuid']
        save()
        print(json.dumps({'configured': state['application'], 'domain': 'https://antscoper.gdodge.dev', 'autoDeploy': False}))
    elif args.command == 'status':
        app = api('applications/' + state['application'])
        deployments = api('deployments/applications/' + state['application'])
        rows = deployments.get('deployments', deployments.get('data', [])) if isinstance(deployments, dict) else deployments
        print(json.dumps({'application': state['application'], 'status': app.get('status'),
            'branch': app.get('git_branch'), 'autoDeploy': app.get('settings', {}).get('is_auto_deploy_enabled'),
            'domains': app.get('docker_compose_domains'), 'deployments': [
                {k: d.get(k) for k in ('deployment_uuid', 'status', 'commit', 'created_at')} for d in rows[:4]]}))
    elif args.command == 'enable-auto':
        api('applications/' + state['application'], 'PATCH', {'is_auto_deploy_enabled': True})
        print('Enabled configured GitHub App push-to-deploy for main.')
    elif args.command == 'deploy':
        result = api('deploy', 'POST', {'uuid': state['application'], 'force': False})
        state['deployment'] = result['deployments'][0]['deployment_uuid']; save()
        print(json.dumps({'deployment': state['deployment']}))


if __name__ == '__main__':main()
