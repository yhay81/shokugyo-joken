[CmdletBinding()]
param([switch]$Local)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Sql = ((Get-Content -Raw -LiteralPath (Join-Path $RepoRoot "ops/product-metrics.sql")) -replace "\s+", " ").Trim()
$Arguments = @("wrangler", "d1", "execute", "shokugyo-joken", "--command", $Sql, "--json")
if ($Local) { $Arguments += "--local" } else { $Arguments += "--remote" }
$Raw = & npx @Arguments
if ($LASTEXITCODE -ne 0) { throw "wrangler d1 execute failed" }
$Parsed = $Raw | ConvertFrom-Json
$Row = $Parsed[0].results[0]
$Users = [int]$Row.users
function Get-Percent([int]$Numerator, [int]$Denominator) {
    if ($Denominator -eq 0) { return 0 }
    return [Math]::Round(100 * $Numerator / $Denominator, 1)
}
[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        searchers = [int]$Row.searchers
        searches = [int]$Row.searches
        no_result_searches = [int]$Row.no_result_searches
        employment_changers = [int]$Row.employment_changers
        year_changers = [int]$Row.year_changers
        metric_changers = [int]$Row.metric_changers
        selectors = [int]$Row.selectors
        comparers = [int]$Row.comparers
        copiers = [int]$Row.copiers
        comparers_7d = [int]$Row.comparers_7d
        copiers_7d = [int]$Row.copiers_7d
        qa_rows = [int]$Row.qa_rows
    }
    rates = [ordered]@{
        search_percent = Get-Percent ([int]$Row.searchers) $Users
        select_percent = Get-Percent ([int]$Row.selectors) $Users
        compare_percent = Get-Percent ([int]$Row.comparers) $Users
        copy_percent = Get-Percent ([int]$Row.copiers) $Users
    }
} | ConvertTo-Json -Depth 4
