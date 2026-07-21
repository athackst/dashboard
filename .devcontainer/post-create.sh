#!/bin/bash

# Get the current ruby version and set .ruby-version
ruby_version=$(ruby -v | awk '{print $2}')
printf %s "$ruby_version" > .ruby-version
echo "Ruby version $ruby_version set in .ruby-version file"

# Install the version of Bundler.
if [ -f Gemfile.lock ] && grep "BUNDLED WITH" Gemfile.lock >/dev/null; then
    echo "Installing bundler in gemfile"
    cat Gemfile.lock | tail -n 2 | grep -C2 "BUNDLED WITH" | tail -n 1 | xargs gem install bundler -v
fi

# If there's a Gemfile, then run `bundle install`
# BUNDLE_APP_CONFIG and BUNDLE_PATH are configured outside the workspace in
# devcontainer.json so local settings and installed gems stay out of the repo.
if [ -f Gemfile ]; then
    bundle install
fi

# Install Node dependencies for Netlify functions and local tooling.
if [ -f package-lock.json ]; then
    npm ci
elif [ -f package.json ]; then
    npm install
fi
