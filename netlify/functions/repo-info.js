const axios = require('axios');
require('dotenv').config();

const githubApi = 'https://api.github.com';
const userName = process.env.GITHUB_USERNAME;
const accessToken = process.env.GITHUB_TOKEN || process.env.JEKYLL_GITHUB_TOKEN;

// Base headers for GitHub API requests.
const githubHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

if (accessToken) {
  githubHeaders.Authorization = `Bearer ${accessToken}`;
}

// Set headers for the response, including CORS headers
const responseHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow requests from any origin
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
  'Content-Type': 'application/json', // Set the content type to application/json
  'Access-Control-Allow-Credentials': true
};

const getPaginatedResults = async (url) => {
  const results = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await axios.get(url, {
      headers: githubHeaders,
      params: {
        per_page: perPage,
        page
      }
    });

    results.push(...response.data);

    if (response.data.length < perPage) {
      return results;
    }

    page += 1;
  }
};

const getOptionalPaginatedResults = async (url) => {
  try {
    return await getPaginatedResults(url);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return [];
    }

    throw error;
  }
};

const getFirstPageResults = async (url, params = {}) => {
  const response = await axios.get(url, {
    headers: githubHeaders,
    params: {
      per_page: 100,
      page: 1,
      ...params
    }
  });

  return response.data;
};

const getOptionalCheckRuns = async (url) => {
  try {
    const response = await axios.get(url, { headers: githubHeaders });
    return response.data.check_runs;
  } catch (error) {
    const response = error.response;
    const acceptedPermissions = response && response.headers &&
      response.headers['x-accepted-github-permissions'];
    const rateLimitRemaining = response && response.headers &&
      response.headers['x-ratelimit-remaining'];

    if (response &&
        response.status === 403 &&
        rateLimitRemaining !== '0' &&
        acceptedPermissions &&
        acceptedPermissions.includes('checks=read')) {
      console.warn('Skipping check runs because the token does not grant Checks access');
      return [];
    }

    throw error;
  }
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);

  return results;
};

const getCombinedRunState = (checkRuns, workflowRuns = []) => {

  const conclusionStates = {
    "startup_failure": 8,
    "failure": 7,
    "cancelled": 6,
    "timed_out": 5,
    "action_required": 4,
    "success": 3,
    "skipped": 2,
    "neutral": 1,
  };

  const statusStates = {
    "queued": 3,
    "in_progress": 2,
    "completed": 1,
  };

  // Create a map to store the latest check run for each name
  const latestCheckRunsMap = new Map();
  const latestWorkflowRunsMap = new Map();

  const getRunTimestamp = (run) => new Date(
    run.run_started_at || run.started_at || run.created_at || 0
  );

  // Iterate through each check run
  for (const checkRun of checkRuns) {
    // Check if we already have a stored check run for this name
    if (latestCheckRunsMap.has(checkRun.name)) {
      // Get the stored check run for this name
      const storedCheckRun = latestCheckRunsMap.get(checkRun.name);
      // Compare timestamps to determine the latest one
      if (getRunTimestamp(checkRun) > getRunTimestamp(storedCheckRun)) {
        // Replace the stored check run with the current one if it's newer
        latestCheckRunsMap.set(checkRun.name, checkRun);
      }
    } else {
      // If no check run is stored for this name, add the current one
      latestCheckRunsMap.set(checkRun.name, checkRun);
    }
  }

  // Startup failures do not create check runs, so retain the latest run for
  // each workflow as a second source of commit-level status.
  for (const workflowRun of workflowRuns) {
    const workflowKey = workflowRun.workflow_id || workflowRun.path || workflowRun.name;
    const storedWorkflowRun = latestWorkflowRunsMap.get(workflowKey);

    if (!storedWorkflowRun || getRunTimestamp(workflowRun) > getRunTimestamp(storedWorkflowRun)) {
      latestWorkflowRunsMap.set(workflowKey, workflowRun);
    }
  }

  // Find the combined conclusion and status from the latest checks and workflows.
  let combinedConclusionKey = '';
  let combinedStatusKey = '';
  let combinedConclusionValue = 0;
  let combinedStatusValue = 0;

  // Iterate through the latest check runs map
  for (const checkRun of latestCheckRunsMap.values()) {
    console.log('Latest state for action', checkRun.name, 'is', checkRun.conclusion, checkRun.status);
    const conclusionStateValue = conclusionStates[checkRun.conclusion];
    const statusStateValue = statusStates[checkRun.status];

    // Find the maximum conclusion state value
    if (conclusionStateValue > combinedConclusionValue) {
      combinedConclusionValue = conclusionStateValue;
      combinedConclusionKey = checkRun.conclusion;
    }

    // Find the maximum status state value
    if (statusStateValue > combinedStatusValue) {
      combinedStatusValue = statusStateValue;
      combinedStatusKey = checkRun.status;
    }
  }

  for (const workflowRun of latestWorkflowRunsMap.values()) {
    console.log('Latest state for workflow', workflowRun.name, 'is', workflowRun.conclusion, workflowRun.status);
    const conclusionStateValue = conclusionStates[workflowRun.conclusion];
    const statusStateValue = statusStates[workflowRun.status];

    if (conclusionStateValue > combinedConclusionValue) {
      combinedConclusionValue = conclusionStateValue;
      combinedConclusionKey = workflowRun.conclusion;
    }

    if (statusStateValue > combinedStatusValue) {
      combinedStatusValue = statusStateValue;
      combinedStatusKey = workflowRun.status;
    }
  }

  return {
    combinedConclusion: combinedConclusionKey,
    combinedStatus: combinedStatusKey
  };
};

const getLatestCommitStatus = async (repoOwner, repoName, branch = 'main') => {
  if (!branch) {
    return {
      combinedConclusion: '',
      combinedStatus: ''
    };
  }

  try {
    const commitsUrl = `${githubApi}/repos/${repoOwner}/${repoName}/commits/${branch}`;
    const commitsResponse = await axios.get(commitsUrl, { headers: githubHeaders });
    const latestCommitSha = commitsResponse.data.sha;

    const combinedStatusUrl = `${githubApi}/repos/${repoOwner}/${repoName}/commits/${latestCommitSha}/check-runs`;
    const workflowRunsUrl = `${githubApi}/repos/${repoOwner}/${repoName}/actions/runs`;
    const [checkRuns, workflowRunsResponse] = await Promise.all([
      getOptionalCheckRuns(combinedStatusUrl),
      axios.get(workflowRunsUrl, {
        headers: githubHeaders,
        params: {
          head_sha: latestCommitSha,
          per_page: 100
        }
      })
    ]);
    console.log('Getting states for', repoName, branch, latestCommitSha);

    const combinedRunState = getCombinedRunState(
      checkRuns,
      workflowRunsResponse.data.workflow_runs
    );

    console.log('Combined state for', repoName, branch, latestCommitSha, 'is', combinedRunState.combinedConclusion, combinedRunState.combinedStatus);

    return combinedRunState;
  } catch (error) {
    if (error.response && (error.response.status === 404 || error.response.status === 409)) {
      console.warn(`Skipping commit status for ${repoOwner}/${repoName}: ${error.response.status}`);
      return {
        combinedConclusion: '',
        combinedStatus: ''
      };
    }

    throw error;
  }
};

const getLatestReleaseInfo = async (repoOwner, repoName) => {
  const releasesUrl = `${githubApi}/repos/${repoOwner}/${repoName}/releases`;

  try {
    const releases = await getFirstPageResults(releasesUrl);
    const latestRelease = releases.find((release) => !release.draft);
    const latestDraftRelease = releases.find((release) => release.draft);
    console.log('Release info for', `${repoOwner}/${repoName}`, {
      releaseCount: releases.length,
      latestRelease: latestRelease ? latestRelease.tag_name || latestRelease.name || '' : '',
      latestDraftRelease: latestDraftRelease ? latestDraftRelease.tag_name || latestDraftRelease.name || '' : ''
    });

    return {
      latestRelease: latestRelease ? latestRelease.tag_name || latestRelease.name || '' : '',
      latestReleaseDate: latestRelease ? latestRelease.published_at || latestRelease.created_at || '' : '',
      latestDraftRelease: latestDraftRelease ? latestDraftRelease.tag_name || latestDraftRelease.name || '' : ''
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        latestRelease: '',
        latestReleaseDate: '',
        latestDraftRelease: ''
      };
    }

    throw error;
  }
};

const shouldIncludeArchivedRepos = (event) => {
  const includeArchived = event.queryStringParameters && event.queryStringParameters.includeArchived;

  return includeArchived === 'true';
};

const normalizeRepositorySource = (source) => {
  if (typeof source === 'string') {
    return {
      owner: source.trim(),
      type: 'user'
    };
  }

  if (source && typeof source === 'object' && typeof source.owner === 'string') {
    return {
      owner: source.owner.trim(),
      type: source.type === 'org' ? 'org' : 'user'
    };
  }

  return null;
};

const getRepositorySources = (event) => {
  const configuredSources = event.queryStringParameters && event.queryStringParameters.repositorySources;

  if (!configuredSources) {
    return userName ? [{ owner: userName, type: 'user' }] : [];
  }

  try {
    const parsedSources = JSON.parse(configuredSources);
    const sources = Array.isArray(parsedSources) ? parsedSources : [parsedSources];

    return sources
      .map(normalizeRepositorySource)
      .filter((source) => source && source.owner);
  } catch (error) {
    console.warn('Failed to parse repositorySources config:', error.message);
    return userName ? [{ owner: userName, type: 'user' }] : [];
  }
};

const shouldIncludePrivateRepos = () =>
  process.env.INCLUDE_PRIVATE_REPOSITORIES === 'true';

const getReposUrl = (source) => {
  if (source.type === 'org') {
    const repositoryType = shouldIncludePrivateRepos() ? 'all' : 'public';
    return `${githubApi}/orgs/${source.owner}/repos?type=${repositoryType}&sort=updated`;
  }

  if (shouldIncludePrivateRepos() && source.owner === userName) {
    return `${githubApi}/user/repos?affiliation=owner&visibility=all&sort=updated`;
  }

  return `${githubApi}/users/${source.owner}/repos?type=owner&sort=updated`;
};

const getRepositoryInfo = async (repo, repoOwner) => {
  try {
    console.log(`Getting info for ${repo.full_name}`);

    const prsUrl = `${githubApi}/repos/${repoOwner}/${repo.name}/pulls?state=open`;
    const issuesUrl = `${githubApi}/repos/${repoOwner}/${repo.name}/issues?state=open`;

    const [pullRequests, issues, commitStatus, releaseInfo] = await Promise.all([
      getOptionalPaginatedResults(prsUrl),
      getOptionalPaginatedResults(issuesUrl),
      getLatestCommitStatus(repoOwner, repo.name, repo.default_branch),
      getLatestReleaseInfo(repoOwner, repo.name)
    ]);

    const numPullRequests = pullRequests.length;
    const numIssues = issues.filter((issue) => !issue.pull_request).length;

    return {
      name: repo.name,
      full_name: repo.full_name,
      owner: repoOwner,
      html_url: repo.html_url,
      archived: repo.archived,
      issues: numIssues,
      pull_requests: numPullRequests,
      latest_release: releaseInfo.latestRelease,
      latest_release_date: releaseInfo.latestReleaseDate,
      latest_draft_release: releaseInfo.latestDraftRelease,
      latest_commit_status: commitStatus.combinedStatus,
      latest_commit_conclusion: commitStatus.combinedConclusion
    };
  } catch (error) {
    console.error(`Failed to load repository info for ${repo.full_name}`, error.message);

    return {
      name: repo.name,
      full_name: repo.full_name,
      owner: repoOwner,
      html_url: repo.html_url,
      archived: repo.archived,
      issues: 0,
      pull_requests: 0,
      latest_release: '',
      latest_release_date: '',
      latest_draft_release: '',
      latest_commit_status: '',
      latest_commit_conclusion: ''
    };
  }
};

exports.handler = async (event) => {
  try {
    const includeArchived = shouldIncludeArchivedRepos(event);
    const repositorySources = getRepositorySources(event);

    if (repositorySources.length === 0) {
      throw new Error('No repository sources configured. Set repository_sources in _config.yml or GITHUB_USERNAME in the environment.');
    }

    const repoListResults = await Promise.allSettled(repositorySources.map(async (source) => {
      const reposUrl = getReposUrl(source);
      const repos = await getPaginatedResults(reposUrl);

      return repos.map((repo) => ({ repo, owner: source.owner }));
    }));

    const failedSources = repoListResults
      .map((result, index) => ({ result, source: repositorySources[index] }))
      .filter(({ result }) => result.status === 'rejected');

    for (const { result, source } of failedSources) {
      console.warn(`Failed to load repository source ${source.owner}:`, result.reason.message);
    }

    if (failedSources.length === repoListResults.length) {
      throw failedSources[0].result.reason;
    }

    const repoLists = repoListResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    const filteredRepos = repoLists
      .flat()
      .map(({ repo, owner }) => ({ repo, owner }))
      .filter(({ repo }) => includeArchived || !repo.archived);

    // Fetch repository information for each repository and tolerate partial failures.
    const repoInfo = await mapWithConcurrency(
      filteredRepos,
      4,
      ({ repo, owner }) => getRepositoryInfo(repo, owner)
    );

    return {
      statusCode: 200,
      headers: responseHeaders, // Include CORS headers in the response
      body: JSON.stringify(repoInfo)
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      headers: responseHeaders, // Include CORS headers in the error response
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
