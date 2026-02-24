import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

const OWNER = 'ahow';
const REPO = 'climate-risk-dashboard';

const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  '.DS_Store',
  'server/public',
  '*.tar.gz',
  '.git',
  '.cache',
  '.local',
  '.config',
  '.upm',
  'generated-icon.png',
  'attached_assets',
  '.replit',
  'replit.nix',
  '.breakpoints',
  'replit.md',
  'snippets/',
];

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.startsWith('*')) {
      return filePath.endsWith(pattern.slice(1));
    }
    return filePath === pattern || filePath.startsWith(pattern + '/') || filePath.includes('/' + pattern + '/') || filePath.includes('/' + pattern);
  });
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldIgnore(relativePath) || shouldIgnore(entry.name)) continue;

    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(relativePath);
    }
  }
  return results;
}

async function syncToGitHub() {
  const accessToken = await getAccessToken();
  const octokit = new Octokit({ auth: accessToken });

  console.log(`Syncing to github.com/${OWNER}/${REPO}...`);

  let repoExists = true;
  try {
    await octokit.repos.get({ owner: OWNER, repo: REPO });
    console.log('Repository found');
  } catch (e: any) {
    if (e.status === 404) {
      console.log('Repository not found, creating...');
      await octokit.repos.createForAuthenticatedUser({
        name: REPO,
        description: 'Climate Risk Dashboard - Quantifies and visualizes climate-related financial risks for publicly traded companies',
        private: false,
        auto_init: false,
      });
      repoExists = false;
      console.log('Repository created');
    } else {
      throw e;
    }
  }

  const projectDir = process.cwd();
  const files = getAllFiles(projectDir);
  console.log(`Found ${files.length} files to sync`);

  const blobs: Array<{ path: string; sha: string }> = [];
  for (const file of files) {
    const fullPath = path.join(projectDir, file);
    const content = fs.readFileSync(fullPath);
    const base64Content = content.toString('base64');

    const { data: blob } = await octokit.git.createBlob({
      owner: OWNER,
      repo: REPO,
      content: base64Content,
      encoding: 'base64',
    });

    blobs.push({ path: file, sha: blob.sha });
    process.stdout.write('.');
  }
  console.log('\nBlobs created');

  const tree = blobs.map(b => ({
    path: b.path,
    mode: '100644' as const,
    type: 'blob' as const,
    sha: b.sha,
  }));

  const { data: treeData } = await octokit.git.createTree({
    owner: OWNER,
    repo: REPO,
    tree,
  });
  console.log('Tree created:', treeData.sha);

  let parentSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({
      owner: OWNER,
      repo: REPO,
      ref: 'heads/main',
    });
    parentSha = ref.object.sha;
  } catch (e) {
    console.log('No existing main branch, creating initial commit');
  }

  const commitParams: any = {
    owner: OWNER,
    repo: REPO,
    message: 'Sync Climate Risk Dashboard from Replit',
    tree: treeData.sha,
  };
  if (parentSha) {
    commitParams.parents = [parentSha];
  }

  const { data: commit } = await octokit.git.createCommit(commitParams);
  console.log('Commit created:', commit.sha);

  try {
    await octokit.git.updateRef({
      owner: OWNER,
      repo: REPO,
      ref: 'heads/main',
      sha: commit.sha,
      force: true,
    });
    console.log('Updated main branch');
  } catch (e) {
    await octokit.git.createRef({
      owner: OWNER,
      repo: REPO,
      ref: 'refs/heads/main',
      sha: commit.sha,
    });
    console.log('Created main branch');
  }

  console.log(`\nDone! Code pushed to https://github.com/${OWNER}/${REPO}`);
}

syncToGitHub().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
