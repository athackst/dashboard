const axios = require('axios');
require('dotenv').config();

const githubApi = 'https://api.github.com';
const userName = process.env.GITHUB_USERNAME;
const accessToken = process.env.GITHUB_TOKEN;

// Set headers to include the access token for GitHub API requests
const githubHeaders = {
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

// Set headers for the response, including CORS headers
const responseHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow requests from any origin
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
  'Content-Type': 'application/json', // Set the content type to application/json
  'Access-Control-Allow-Credentials': true
};

const getDefaultBranch = async (repoOwner, repoName) => {
  const repoDetailsUrl = `${githubApi}/repos/${repoOwner}/${repoName}`;
  const repoDetailsResponse = await axios.get(repoDetailsUrl, { headers: githubHeaders });
  const defaultBranch = repoDetailsResponse.data.default_branch;
  console.log('Default branch for ', repoDetailsUrl, ' is ', defaultBranch);
  return defaultBranch;
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
  const commitsUrl = `${githubApi}/repos/${repoOwner}/${repoName}/commits/${branch}`;
  const commitsResponse = await axios.get(commitsUrl, { headers: githubHeaders });
  const latestCommitSha = commitsResponse.data.sha;

  const combinedStatusUrl = `${githubApi}/repos/${repoOwner}/${repoName}/commits/${latestCommitSha}/check-runs`;
  const combinedStatusResponse = await axios.get(combinedStatusUrl, { headers: githubHeaders });
  console.log('Getting states for', repoName, branch, latestCommitSha);

  const checkRunState = getCombinedRunState(combinedStatusResponse.data.check_runs);

  console.log('Combined state for', repoName, branch, latestCommitSha, 'is', checkRunState.combinedConclusion, checkRunState.combinedStatus);

  return checkRunState;
};

exports.handler = async () => {
  try {
    // Get the list of repositories for the user
    const reposUrl = `${githubApi}/users/${userName}/repos?type=owner&sort=updated`;
    const reposResponse = await axios.get(reposUrl, { headers: githubHeaders });
    const repos = reposResponse.data;

    // Fetch repository information for each repository using Promise.all
    const repoInfoPromises = repos.map(async (repo) => {
      console.log(`Getting info for ${repo.name}`);

      // Get the number of open pull requests
      const prsUrl = `${githubApi}/repos/${userName}/${repo.name}/pulls?state=open`;
      const prsResponse = await axios.get(prsUrl, { headers: githubHeaders });
      const numPullRequests = prsResponse.data.length;

      // Get the number of open issues (excluding pull requests)
      const issuesUrl = `${githubApi}/repos/${userName}/${repo.name}/issues?state=open`;
      const issuesResponse = await axios.get(issuesUrl, { headers: githubHeaders });
      const numIssues = issuesResponse.data.length - numPullRequests;

      // Get the default branch name
      const defaultBranch = await getDefaultBranch(userName, repo.name);

      // Get the latest commit status of the default branch
      const commitStatus = await getLatestCommitStatus(userName, repo.name, defaultBranch);

      return {
        name: repo.name,
        html_url: repo.html_url,
        issues: numIssues,
        pull_requests: numPullRequests,
        latest_commit_status: commitStatus.combinedStatus,
        latest_commit_conclusion: commitStatus.combinedConclusion
      };
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
