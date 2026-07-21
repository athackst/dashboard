![dashboard](/assets/dashboard.png)

# GitHub Dashboard

Live: [dashboard.althack.dev](https://dashboard.althack.dev)

To create your own dashboard, use the Deploy to Netlify button below. It creates
a copy of the repository in your GitHub account and deploys the site to Netlify.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/athackst/dashboard)

Update `_config.yml` with the repositories to show:

```yaml
theme: jekyll-theme-primerpages
repository: athackst/dashboard # The name of your repository
url: https://dashboard.althack.dev # The url of your host
include_archived_repositories: "false" # Optional: set to "true" to include archived repositories
repository_sources:
  - athackst # Show repositories owned by this user
  - ros-controls # Include another user
  - owner: PrimerPages # Include an organization
    type: org
```

`repository_sources` accepts either a simple list of owners, or objects if you want to be more explicit:

```yaml
repository_sources:
  - athackst
  - owner: openai
    type: org
```

If one configured source is temporarily unavailable, the dashboard continues
loading repositories from the remaining sources. It reports an error only when
every source fails.

Public repositories can be loaded without authentication, although GitHub
applies a much lower API rate limit to unauthenticated requests. For a deployed
dashboard, configure these [Netlify environment variables](https://docs.netlify.com/configure-builds/environment-variables/):

- `GITHUB_USERNAME`: Your GitHub username. Required when including private
  repositories owned by your user account.
- `GITHUB_TOKEN`: A [GitHub personal access token](https://github.com/settings/tokens).
  Recommended for higher API limits and required for private repositories.

The token needs read access only. Give a deployed dashboard token access only
to repositories that are safe to display.

### Showing private repositories locally

To include private repositories owned by your user account when running the
dashboard locally, add the following values to `.env`:

```dotenv
GITHUB_USERNAME=your-github-user-name
GITHUB_TOKEN=your-github-token
INCLUDE_PRIVATE_REPOSITORIES=true
```

Keep `INCLUDE_PRIVATE_REPOSITORIES` in the local `.env` only; do not configure
it in Netlify if the deployed dashboard should show public repositories only.
The private repository query is used only for the `repository_sources` entry
that exactly matches `GITHUB_USERNAME`.

Organization sources return public repositories by default. They include
private repositories accessible to the token only when
`INCLUDE_PRIVATE_REPOSITORIES=true`.

For a fine-grained personal access token, select **All repositories** or select
each private repository that should appear. Grant these repository permissions
as read-only:

- Metadata (included automatically)
- Contents
- Issues
- Pull requests
- Actions

Fine-grained personal access tokens do not expose the Checks permission in the
GitHub token settings. When Checks access is unavailable, the dashboard uses
GitHub Actions workflow runs for commit status instead.

No write permissions are required. If the repositories belong to an
organization, create the token for that resource owner and complete any
required organization approval or SSO authorization. For a classic personal
access token, grant the broader `repo` scope instead.

If both `GITHUB_TOKEN` and `JEKYLL_GITHUB_TOKEN` are set, `GITHUB_TOKEN` takes
precedence. Restart `npm run dev` after changing `.env`.

## Development setup

The recommended setup uses [Visual Studio Code](https://code.visualstudio.com/)
with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
The container provides the runtime tools and installs project dependencies.

Host requirements:

- Git
- Docker
- Visual Studio Code with the Dev Containers extension

Open the repository in Visual Studio Code:

```bash
cd dashboard
code .
```

Open the command palette and select **Dev Containers: Reopen in Container**.
The post-create script installs Bundler, Ruby gems, and Node dependencies.

## Running locally

Create a `.env` file for local credentials. The file is ignored by Git.

When running without the devcontainer, use:

- Node `24`
- Ruby `3.4.10`
- Bundler `2.6.9`

Install dependencies when running without the devcontainer:

```bash
gem install bundler -v 2.6.9
bundle install
npm ci
```

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:8888](http://localhost:8888). Netlify Dev proxies the
Jekyll site and local serverless function through this port.
