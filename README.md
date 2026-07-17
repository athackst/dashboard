![dashboard](/assets/dashboard.png)

# Github Dashboard

Live: [dashboard.althack.dev](https://dashboard.althack.dev)

If you want your own copy to play around with, the quickest way to get it up and running is clicking the Deploy to Netlify button below. It will clone this repository into your own account, and deploy the site to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/athackst/dashboard)

You will want to add or update your `_config.yml` file with information about your dashboard sources.

```yaml
theme: jekyll-theme-profile
repository: athackst/dashboard # The name of your repository
url: https://dashboard.althack.dev # The url of your host
include_archived_repositories: "false" # Optional: set to "true" to include archived repositories
repository_sources:
  - athackst # Default: show repositories owned by this user
  - ros-controls # Optional: include additional users or organizations
```

`repository_sources` accepts either a simple list of owners, or objects if you want to be more explicit:

```yaml
repository_sources:
  - athackst
  - owner: openai
    type: org
```

You will need to set [environment variables](https://docs.netlify.com/configure-builds/environment-variables/) with your [Github Personal Access Token](https://github.com/settings/tokens) and username.

- `GITHUB_USERNAME`: Your github user name
- `GITHUB_TOKEN`: Your github token

These allow the dashboard to pull repository information (read-only public access required). A token is especially helpful if you add organization-owned repositories or need access to higher API limits.

## Setup

To run the dashboard locally, you can use the [Visual Studo Code](https://code.visualstudio.com/) with the [Dev Container](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) plugin which includes everything you need to get started including the following:

**System Requirements**

- git
- NodeJS
- Ruby

`cd` into your local copy of the repository and open it with code

```bash
cd dashboard
code .
```

Then `Ctrl+Shift+P` to open the command pallet and search for `Dev Containers: Reopen in Container`.

## Running locally

Create a `.env` file to store secrets locally.

Recommended local versions:

- Node `24`
- Ruby `4.0.5`
- Bundler `2.6.9`

Next, run `npx netlify dev` to start the local development server.

This will start the client server on [http://localhost:8888](http://localhost:8888)
