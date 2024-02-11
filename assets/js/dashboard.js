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

// Function to create a cell for pull requests
function createCountCell(count, icon) {
    const cell = document.createElement('td');
    cell.classList.add('m-2', 'p-2', 'text-right');

    if (count === 0) {
        const noneSpan = document.createElement('span');
        noneSpan.classList.add('State', 'State--draft');
        noneSpan.textContent = 'None';
        cell.appendChild(noneSpan);
    } else {
        const span = document.createElement('span');
        span.classList.add('State', 'State--open');
        span.innerHTML = `${icon} ${count} Open`;
        cell.appendChild(span);
    }
    return cell;
}

// Function to create a button
function createButton(text, onClickHandler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('btn', 'btn-outline');
    button.setAttribute('data-mdb-ripple-color', 'dark');
    button.textContent = text;
    button.onclick = onClickHandler;
    return button;
}

function createButtonCell(text, onClickHandler) {
    const buttonCell = document.createElement('td');
    buttonCell.classList.add('m-2', 'p-2');
    buttonCell.appendChild(createButton(text, onClickHandler));
    return buttonCell;
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
repositories.style.display = 'none';
// Fetch repository data from the serverless function
fetch('/.netlify/functions/repo-info')
    .then(response => response.json())
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

            row.appendChild(createRepositoryNameCell(repository));
            row.appendChild(createCountCell(repository.pull_requests, '{% octicon git-pull-request height: 16 fill:"#ffff" %}'));
            row.appendChild(createButtonCell('View', () => window.open(`${repository.html_url}/pulls`, '_blank')));
            row.appendChild(createCountCell(repository.issues, '{% octicon issue-opened height: 16 fill:"#ffff" %}'));
            row.appendChild(createButtonCell('View', () => window.open(`${repository.html_url}/issues`, '_blank')));

            repositoryData.appendChild(row);
        });
    })
    .catch(error => {
        console.error(error);
        // Handle error
        const loadingDiv = document.getElementById('loading');
        loadingDiv.innerHTML = '{% octicon cloud-offline height:24 %}<p>Error loading data.<\p>';
    });
