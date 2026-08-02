# Product metrics

`npm run metrics` reads non-QA events from D1 and reports unique users, searchers, selectors, comparers, copiers, and seven-day comparison activity.

Allowed event names:

- `visited`
- `searched`, `no_result`
- `group_changed`, `employment_changed`, `year_changed`, `metric_changed`
- `occupation_added`, `occupation_removed`
- `compared`, `copied`

QA rows (`is_qa=1`) are reported separately and never included in user counts. Search terms, occupation names, values, URLs, IP addresses, or user-agent strings are not inserted by the application.
