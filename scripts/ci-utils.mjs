// CI artifacts contain only sanitized console logs and numeric results.
export function sanitizeLog(text,secrets=[]){
 for(const secret of secrets.filter(s=>s.length>=8))text=text.split(secret).join('[REDACTED]');
 return text
  .replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]')
  .replace(/([?&](?:oobCode|access_token|refresh_token|id_token|token|code)=)[^\s&"'<>]+/gi,'$1[REDACTED]')
  .replace(/("(?:idToken|accessToken|refreshToken|password|private_key)"\s*:\s*")[^"\r\n]*/gi,'$1[REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,'[REDACTED_JWT]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,})/g,'[REDACTED_TOKEN]');
}
export function parseCounts(log){
 log=log.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/^\s*ℹ /gm,'# ');
 const last=re=>[...log.matchAll(re)].at(-1)?.[1];
 const total=last(/^\s*# tests (\d+)\s*$/gm);
 if(total!==undefined)return {total:Number(total),passed:Number(last(/^\s*# pass (\d+)\s*$/gm)||0),failed:Number(last(/^\s*# fail (\d+)\s*$/gm)||0),skipped:Number(last(/^\s*# skipped (\d+)\s*$/gm)||0)};
 const passed=last(/^\s*(\d+) passed(?:\s|$)/gm),failed=last(/^\s*(\d+) failed(?:\s|$)/gm),skipped=last(/^\s*(\d+) skipped(?:\s|$)/gm);
 if([passed,failed,skipped].every(v=>v===undefined))return null;
 const counts={passed:Number(passed||0),failed:Number(failed||0),skipped:Number(skipped||0)};
 return {total:counts.passed+counts.failed+counts.skipped,...counts};
}
