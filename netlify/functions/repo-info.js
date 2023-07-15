const axios = require('axios');
require('dotenv').config();

exports.handler = async () => {
  try {
    // Set the GitHub API endpoint, user name, and personal access token
    const githubApi = "https://api.github.com";
    const userName = process.env.GITHUB_USERNAME;
    const accessToken = process.env.GITHUB_TOKEN;

    // Set headers to include the access token
    const headers = {
        'Access-Control-Allow-Origin': '*', // Allow requests from any origin
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
        'Content-Type': 'application/json', // Set the content type to application/json
        'Access-Control-Allow-Credentials': true,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };

    // Get the list of repositories for the user
    const reposUrl = `${githubApi}/users/${userName}/repos?type=owner&sort=updated`;
    const reposResponse = await axios.get(reposUrl, { headers });
    const repos = reposResponse.data;

    // Fetch repository information for each repository using Promise.all
    const repoInfoPromises = repos.map(async (repo) => {
      console.log(`Getting info for ${repo.name}`);

      // Get the number of open pull requests
      const prsUrl = `${githubApi}/repos/${userName}/${repo.name}/pulls?state=open`;
      const prsResponse = await axios.get(prsUrl, { headers });
      const numPullRequests = prsResponse.data.length;

      // Get the number of open issues (excluding pull requests)
      const issuesUrl = `${githubApi}/repos/${userName}/${repo.name}/issues?state=open`;
      const issuesResponse = await axios.get(issuesUrl, { headers });
      const numIssues = issuesResponse.data.length - numPullRequests;

      return {
        name: repo.name,
        html_url: repo.html_url,
        issues: numIssues,
        pull_requests: numPullRequests
      };
    });

    // Wait for all repository information promises to resolve
    const repoInfo = await Promise.all(repoInfoPromises);

    return {
      statusCode: 200,
      body: JSON.stringify(repoInfo)
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
