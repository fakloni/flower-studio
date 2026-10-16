"""Local CPU background removal; source files are preserved."""
import argparse
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--model', default='u2netp', help='Default: lightweight u2netp')
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if not source.is_file():
        parser.error(f'Source does not exist: {source}')
    if output.exists():
        parser.error(f'Output already exists: {output}')
    if output.suffix.lower() != '.png':
        parser.error('Output must be .png to retain transparency.')

    project_root = Path(__file__).resolve().parents[1]
    os.environ['U2NET_HOME'] = str(project_root / 'asset-sources' / '.model-cache')
    os.environ.setdefault('OMP_NUM_THREADS', '2')
    from rembg import new_session, remove

    session = new_session(args.model, providers=['CPUExecutionProvider'])
    result = remove(source.read_bytes(), session=session)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also protects against another process creating this path.
    with output.open('xb') as file:
        file.write(result)
    print(output)


if __name__ == '__main__':
    main()
