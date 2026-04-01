import { copyText } from '../utils/dom.js';

function buildRunnerUrl(receiverUrl) {
  return new URL('./current-page-runner.js', new URL('./assets/js/modes/', receiverUrl)).toString();
}

export function generateBookmarklet(receiverUrl) {
  const runnerUrl = buildRunnerUrl(receiverUrl);
  const payload = `(function(){try{var s=document.getElementById('__bid_runner__');if(s)s.remove();s=document.createElement('script');s.id='__bid_runner__';s.src=${JSON.stringify(runnerUrl)}+'?receiver='+encodeURIComponent(${JSON.stringify(receiverUrl)})+'&t='+(Date.now());(document.head||document.documentElement).appendChild(s);}catch(e){alert('Brand Identity Detector could not inject its helper script on this page. '+e.message);}})();`;
  return `javascript:${payload}`;
}

export function initCurrentPageMode() {
  const receiverInput = document.getElementById('receiverUrl');
  const codeArea = document.getElementById('bookmarkletCode');
  const bookmarkletLink = document.getElementById('bookmarkletLink');
  const copyBookmarkletBtn = document.getElementById('copyBookmarkletBtn');
  const copyReceiverUrlBtn = document.getElementById('copyReceiverUrlBtn');

  const receiverUrl = `${window.location.origin}${window.location.pathname}`;
  const bookmarklet = generateBookmarklet(receiverUrl);

  receiverInput.value = receiverUrl;
  codeArea.value = bookmarklet;
  bookmarkletLink.href = bookmarklet;

  copyBookmarkletBtn.addEventListener('click', () => copyText(bookmarklet));
  copyReceiverUrlBtn.addEventListener('click', () => copyText(receiverUrl));

  return { receiverUrl, bookmarklet };
}
