/* Runs inside the sandboxed preview iframe (srcdoc). It only reports the
   nearest [data-edit] element to the parent; it never reads the parent,
   navigates, or touches the network. Kept as a real file so the shipped CSP
   can forbid inline scripts. */
'use strict';

document.addEventListener('click', function (event) {
  event.preventDefault();
  var target = event.target;
  var el = target && target.closest ? target.closest('[data-edit]') : null;
  try {
    parent.postMessage(
      { __sigstudio: 'edit', key: el ? el.getAttribute('data-edit') : '' },
      '*'
    );
  } catch (err) {
    /* Sandboxed context — nothing to do. */
  }
}, true);
