const fs = require('node:fs');

// Diagnostics for disposable CI fixtures only. No environment/config dumps.
module.exports = class GitHubSummaryReporter {
  onBegin(_config, suite) { this.suite = suite; }
  onEnd(result) {
    if (!process.env.GITHUB_STEP_SUMMARY) return;
    const tests = this.suite.allTests();
    const failed = tests.filter(test => test.outcome() !== 'expected' && test.outcome() !== 'skipped');
    const clean = text => String(text || '').replace(/\x1b\[[0-9;]*m/g, '')
      .split('\n').filter(line => !/authorization|cookie|csrf|password|secret/i.test(line))
      .join('\n').replace(/`/g, "'").slice(0, 3500);
    let summary = `## Browser regression: ${result.status}\n\n${tests.length} scenarios; ${failed.length} failed.\n`;
    for (const test of failed) {
      summary += `\n### ${clean(test.titlePath().slice(1).join(' → '))}\n\n`;
      for (const run of test.results) {
        for (const error of run.errors) summary += '```text\n' + clean(error.message) + '\n```\n';
        for (const chunk of run.stderr) summary += '```text\n' + clean(chunk.toString()) + '\n```\n';
      }
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
};
