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

const getCombinedRunState = (checkRuns) => {

  const conclusionStates = {
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

  // Iterate through each check run
  for (const checkRun of checkRuns) {
    // Check if we already have a stored check run for this name
    if (latestCheckRunsMap.has(checkRun.name)) {
      // Get the stored check run for this name
      const storedCheckRun = latestCheckRunsMap.get(checkRun.name);
      // Compare timestamps to determine the latest one
      if (new Date(checkRun.started_at) > new Date(storedCheckRun.started_at)) {
        // Replace the stored check run with the current one if it's newer
        latestCheckRunsMap.set(checkRun.name, checkRun);
      }
    } else {
      // If no check run is stored for this name, add the current one
      latestCheckRunsMap.set(checkRun.name, checkRun);
    }
  }

  // Now, find the combinedConclusion and combinedStatus from the latest check runs
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
    const combinedStatusResponse = await axios.get(combinedStatusUrl, { headers: githubHeaders });
    console.log('Getting states for', repoName, branch, latestCommitSha);

    const checkRunState = getCombinedRunState(combinedStatusResponse.data.check_runs);

    console.log('Combined state for', repoName, branch, latestCommitSha, 'is', checkRunState.combinedConclusion, checkRunState.combinedStatus);

    return checkRunState;
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

const shouldIncludeArchivedRepos = (event) => {
  const includeArchived = event.queryStringParameters && event.queryStringParameters.includeArchived;

  return includeArchived === 'true';
};

exports.handler = async (event) => {
  try {
    // Get the list of repositories for the user
    const reposUrl = `${githubApi}/users/${userName}/repos?type=owner&sort=updated`;
    const includeArchived = shouldIncludeArchivedRepos(event);
    const repos = await getPaginatedResults(reposUrl);
    const filteredRepos = includeArchived ? repos : repos.filter((repo) => !repo.archived);

    // Fetch repository information for each repository and tolerate partial failures.
    const repoInfoPromises = filteredRepos.map(async (repo) => {
      try {
        console.log(`Getting info for ${repo.name}`);

        const prsUrl = `${githubApi}/repos/${userName}/${repo.name}/pulls?state=open`;
        const issuesUrl = `${githubApi}/repos/${userName}/${repo.name}/issues?state=open`;

        const [pullRequests, issues, commitStatus] = await Promise.all([
          getPaginatedResults(prsUrl),
          getPaginatedResults(issuesUrl),
          getLatestCommitStatus(userName, repo.name, repo.default_branch)
        ]);

        const numPullRequests = pullRequests.length;
        const numIssues = issues.filter((issue) => !issue.pull_request).length;

        return {
          name: repo.name,
          html_url: repo.html_url,
          archived: repo.archived,
          issues: numIssues,
          pull_requests: numPullRequests,
          latest_commit_status: commitStatus.combinedStatus,
          latest_commit_conclusion: commitStatus.combinedConclusion
        };
      } catch (error) {
        console.error(`Failed to load repository info for ${repo.name}`, error.message);

        return {
          name: repo.name,
          html_url: repo.html_url,
          archived: repo.archived,
          issues: 0,
          pull_requests: 0,
          latest_commit_status: '',
          latest_commit_conclusion: ''
        };
      }
    });

    // Wait for all repository information promises to resolve
    const repoInfo = await Promise.all(repoInfoPromises);

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
