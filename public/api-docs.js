'use strict';
(async () => {
  const target = document.querySelector('#api-reference');
  try {
    const response = await fetch('/api/openapi.json', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to your workspace to view the API reference.' : 'Could not load API documentation.');
    const spec = await response.json(); target.textContent = '';
    for (const [path, methods] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(methods)) {
      const details = document.createElement('details'); details.className = 'card';
      const summary = document.createElement('summary'); summary.textContent = `${method.toUpperCase()} ${path} — ${operation.summary}`; details.append(summary);
      const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere'; pre.textContent = JSON.stringify(operation, null, 2); details.append(pre); target.append(details);
    }
    const definitions = document.createElement('details'); definitions.className = 'card';
    const title = document.createElement('summary'); title.textContent = 'Record schemas'; definitions.append(title);
    const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = JSON.stringify(spec.components.schemas, null, 2); definitions.append(pre); target.append(definitions);
  } catch (error) { target.textContent = error.message; }
})();
