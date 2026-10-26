export function readInvitation(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const values = fragment.has('invite') ? fragment.getAll('invite') : url.searchParams.getAll('invite');
  const code = values.length === 1 ? values[0].trim() : '';
  const invite = code && code.length <= 512 && !/[\x00-\x1f\x7f]/.test(code) ? code : '';
  url.searchParams.delete('invite');
  if (fragment.has('invite')) { fragment.delete('invite'); url.hash = fragment.toString(); }
  return { invite, cleanUrl: url.pathname + url.search + url.hash };
}
export function captureInvitation(location, history) {
  const result = readInvitation(location.href);
  if (result.cleanUrl !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', result.cleanUrl);
  return result.invite;
}
export function invitationLink(base, invite) {
  const code = String(invite).trim();
  if (!code || code.length > 512 || /[\x00-\x1f\x7f]/.test(code)) throw new Error('请填写有效的邀请码。');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('邀请链接需要网站地址。');
  url.search = ''; url.hash = 'invite=' + encodeURIComponent(code);
  return url.href;
}
