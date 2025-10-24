#!/bin/sh
if [ "$1" = "--auth" ]; then
  # Run auth command
  exec bun run dist/main.js auth
else
  # Build start command with optional parameters
  START_CMD="bun run dist/main.js start"

  # Add GitHub token if provided
  if [ -n "$GH_TOKEN" ]; then
    START_CMD="$START_CMD -g $GH_TOKEN"
  fi

  # Add API key if provided
  if [ -n "$API_KEY" ]; then
    START_CMD="$START_CMD --api-key $API_KEY"
  fi

  # Append any additional arguments
  if [ $# -gt 0 ]; then
    START_CMD="$START_CMD $@"
  fi

  # Execute the command
  exec $START_CMD
fi

