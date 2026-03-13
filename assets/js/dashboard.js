---
---

// Function to create a repository name cell with an icon based on the latest commit status
function createRepositoryNameCell(repository) {
    const repositoryNameCell = document.createElement('td');
    repositoryNameCell.classList.add('m-2', 'p-2');

    const repositoryLink = document.createElement('a');
    repositoryLink.href = repository.html_url;
    repositoryLink.textContent = repository.name;
    repositoryNameCell.appendChild(repositoryLink);

    const icon = getCommitStatusIcon(repository);
    if (icon) {
        repositoryNameCell.appendChild(icon);
    }

    return repositoryNameCell;
}

// Function to create a linked count cell
function createCountCell(count, icon, url) {
    const cell = document.createElement('td');
    cell.classList.add('m-2', 'p-2');

    if (count === 0) {
        const noneSpan = document.createElement('span');
        noneSpan.classList.add('color-fg-muted');
        noneSpan.textContent = 'None';
        cell.appendChild(noneSpan);
    } else {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noreferrer';

        const span = document.createElement('span');
        span.classList.add('State', 'State--open');
        span.innerHTML = `${icon} ${count} Open`;
        link.appendChild(span);
        cell.appendChild(link);
    }
    return cell;
}

function formatReleaseDate(dateString) {
    if (!dateString) {
        return '';
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function createReleaseCell(repository) {
    const cell = document.createElement('td');
    cell.classList.add('m-2', 'p-2');
    const releasesUrl = `${repository.html_url}/releases`;

    if (!repository.latest_release && !repository.latest_draft_release) {
        const noneSpan = document.createElement('span');
        noneSpan.classList.add('color-fg-muted');
        noneSpan.textContent = 'None';
        cell.appendChild(noneSpan);
        return cell;
    }

    if (repository.latest_release) {
        const releaseLink = document.createElement('a');
        releaseLink.href = releasesUrl;
        releaseLink.target = '_blank';
        releaseLink.rel = 'noreferrer';

        const releaseSpan = document.createElement('span');
        releaseSpan.classList.add('State', 'State--merged', 'mr-2');
        releaseSpan.textContent = repository.latest_release;
        releaseLink.appendChild(releaseSpan);
        cell.appendChild(releaseLink);
    }

    if (repository.latest_draft_release) {
        const draftLink = document.createElement('a');
        draftLink.href = releasesUrl;
        draftLink.target = '_blank';
        draftLink.rel = 'noreferrer';

        const draftSpan = document.createElement('span');
        draftSpan.classList.add('State', 'State--draft', 'mr-2');
        draftSpan.textContent = repository.latest_draft_release;
        draftLink.appendChild(draftSpan);
        cell.appendChild(draftLink);
    }

    if (repository.latest_release_date) {
        const dateSpan = document.createElement('span');
        dateSpan.classList.add('color-fg-muted');
        dateSpan.textContent = formatReleaseDate(repository.latest_release_date);
        cell.appendChild(dateSpan);
    }

    return cell;
}

// Function to create an icon based on the latest commit status
function getCommitStatusIcon(repository) {
    const status = repository.latest_commit_status;
    const conclusion = repository.latest_commit_conclusion;

    if (status === 'completed' && conclusion === 'success') {
        return createIcon('{% octicon check height:16 %}', 'color-fg-success');
    } else if (conclusion === 'failure') {
        return createIcon('{% octicon x height:16 %}', 'color-fg-danger');
    } else if (status === 'queued' || status === 'in_progress') {
        return createIcon('{% octicon stopwatch height:16 %}', 'color-fg-warning');
    } else if (conclusion !== '') {
        return createIcon('{% octicon circle-slash height:16 %}', 'color-fg-neutral');
    }

    return null; // No icon
}

function createIcon(name, className) {
    const icon = document.createElement('span');
    icon.classList.add(className, 'm-2');
    icon.innerHTML = name;
    return icon;
}

const repositories = document.getElementById('repositories');
const includeArchived = repositories.dataset.includeArchived === 'true';
const repoInfoUrl = new URL('/.netlify/functions/repo-info', window.location.origin);
repositories.style.display = 'none';

repoInfoUrl.searchParams.set('includeArchived', String(includeArchived));

// Fetch repository data from the serverless function
fetch(repoInfoUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        return response.json();
    })
    .then(data => {
        const repositoryData = document.getElementById('repository-data');
        const loadingDiv = document.getElementById('loading');

        // Hide the loading image
        loadingDiv.style.display = 'none';

        // Show the table
        repositories.style.display = 'block';

        data.forEach(repository => {
            const row = document.createElement('tr');
            row.classList.add('border-top');
            const pullRequestsUrl = `${repository.html_url}/pulls`;
            const issuesUrl = `${repository.html_url}/issues`;

            row.appendChild(createRepositoryNameCell(repository));
            row.appendChild(createCountCell(repository.pull_requests, '{% octicon git-pull-request height: 16 fill:"#ffff" %}', pullRequestsUrl));
            row.appendChild(createCountCell(repository.issues, '{% octicon issue-opened height: 16 fill:"#ffff" %}', issuesUrl));
            row.appendChild(createReleaseCell(repository));

            repositoryData.appendChild(row);
        });
    })
    .catch(error => {
        console.error(error);
        // Handle error
        const loadingDiv = document.getElementById('loading');
        loadingDiv.innerHTML = '{% octicon cloud-offline height:24 %}<p>Error loading data.</p>';
    });
