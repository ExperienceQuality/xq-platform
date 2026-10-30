import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionPattern = /^\d+\.\d+\.\d+$/;
const tagPattern = /^v\d+\.\d+\.\d+$/;
const shaPattern = /^[0-9a-f]{40}$/i;

if (isMainModule()) {
  try {
    const version = requiredEnvironment('RELEASE_VERSION');
    const sha = requiredEnvironment('RELEASE_SHA');
    const repository = requiredEnvironment('GITHUB_REPOSITORY');
    requiredEnvironment('GH_TOKEN');
    createPlatformRelease({ version, sha, repository });
  } catch (error) {
    console.error(`create:platform-release: ${error.message}`);
    process.exitCode = 1;
  }
}

export function createPlatformRelease({
  version,
  sha,
  repository,
  tag = `v${version}`,
  run = execFileSync,
}) {
  if (!versionPattern.test(version)) throw new Error(`invalid release version ${version}`);
  if (!shaPattern.test(sha)) throw new Error(`invalid release SHA ${sha}`);
  if (!tagPattern.test(tag)) throw new Error(`invalid release tag ${tag}`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error(`invalid repository ${repository}`);

  const existingCommit = resolveTagCommit({ repository, tag, run });
  if (existingCommit !== null && existingCommit.toLowerCase() !== sha.toLowerCase()) {
    throw new Error(`${tag} already points at ${existingCommit}; refusing to retarget it`);
  }
  if (existingCommit === null) createAnnotatedTag({ repository, tag, sha, run });

  if (releaseExists({ repository, tag, run })) {
    console.log(`GitHub Release ${tag} already exists.`);
    return { tag, createdTag: existingCommit === null, createdRelease: false };
  }

  gh(run, [
    'release',
    'create',
    tag,
    '--repo',
    repository,
    '--verify-tag',
    '--generate-notes',
    '--notes',
    `@experiencequality test platform release ${version}; published to the company GitHub Packages npm registry.`,
  ]);
  console.log(`Created GitHub Release ${tag}.`);
  return { tag, createdTag: existingCommit === null, createdRelease: true };
}

export function resolveTagCommit({ repository, tag, run = execFileSync }) {
  let reference;
  try {
    reference = JSON.parse(gh(run, ['api', `repos/${repository}/git/ref/tags/${tag}`]));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const object = reference.object;
  if (object?.type === 'commit') return object.sha;
  if (object?.type === 'tag') {
    const annotated = JSON.parse(gh(run, ['api', `repos/${repository}/git/tags/${object.sha}`]));
    if (annotated?.object?.type !== 'commit')
      throw new Error(`${tag} does not resolve to a commit`);
    return annotated.object.sha;
  }
  throw new Error(`${tag} has unsupported git object type ${object?.type}`);
}

function createAnnotatedTag({ repository, tag, sha, run }) {
  const tagObject = JSON.parse(
    gh(run, [
      'api',
      `repos/${repository}/git/tags`,
      '-f',
      `tag=${tag}`,
      '-f',
      `message=Release ${tag}`,
      '-f',
      `object=${sha}`,
      '-f',
      'type=commit',
    ]),
  );
  gh(run, [
    'api',
    `repos/${repository}/git/refs`,
    '-f',
    `ref=refs/tags/${tag}`,
    '-f',
    `sha=${tagObject.sha}`,
  ]);
  console.log(`Created annotated tag ${tag}.`);
}

function releaseExists({ repository, tag, run }) {
  try {
    gh(run, ['release', 'view', tag, '--repo', repository, '--json', 'id']);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error) {
  const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message ?? ''}`;
  return /404|not found/i.test(output);
}

function gh(run, args) {
  return run('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  );
}
