'use strict';
// Test process preload ONLY. No external call: production provider transport is
// exercised against a deterministic Response for a reserved .invalid hostname.
const original = global.fetch;
global.fetch = async function(url, options) {
  if (String(url) === 'https://llm-fixture.invalid/v1/chat/completions') {
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ markdown: 'Reviewed synthetic order documentation.\n\n<script>alert("fixture")</script>', unresolved: ['Confirm expansion semantics'], descriptionEdits: [{ field: 'req_query', index: 0, desc: 'Reviewed expansion selector' }] }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return original(url, options);
};
