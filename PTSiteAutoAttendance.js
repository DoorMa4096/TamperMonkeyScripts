// ==UserScript==
// @name         PT site auto attendance (self use)
// @namespace    http://tampermonkey.net/
// @version      0.3.0
// @description  每天凌晨0点在pt站点进行签到（精确触发 + 轮询兜底，错过时间点也会自动补签）
// @author       Door Ma
// @match        https://pt.btschool.club/*
// @match        https://kufei.org/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    /* ==================== 配置 ==================== */

    const CONFIG = {
        // 每天的签到时间点（浏览器本地时间）
        checkTime: { hour: 0, minute: 0, second: 45 },
        // 兜底轮询间隔（毫秒）：用于对抗浏览器后台节流、标签页冻结、电脑休眠导致的定时器失效
        pollInterval: 30 * 1000,
        // 找不到签到按钮时的重试间隔基数与上限（按连续失败次数递增）
        retryBaseDelay: 5 * 1000,
        retryMaxDelay: 60 * 1000,
        // 连续失败多少次后刷新一次页面
        reloadAfterFailures: 3,
        // 单个标签页会话内最多刷新次数，避免无限刷新
        maxReloads: 10
    };

    const ptSites = [{
      name: "BTSCHOOL",
      domain: "pt.btschool.club",
      attendenceUrl: "index.php?action=addbonus",
      attendenceText: "每日签到"
    }, {
      name: "库非",
      domain: "kufei.org",
      attendenceUrl: "attendance.php",
      attendenceText: "签到得魔力"
    }];

    const LOG_PREFIX = '[签到脚本]';

    /* ==================== 工具函数 ==================== */

    const pad2 = n => String(n).padStart(2, '0');

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function warn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }

    // 当天标识，形如 2026-10-20
    function todayKey(date = new Date()) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    // 当天的签到时间点
    function checkTimeOfToday(date = new Date()) {
        return new Date(
            date.getFullYear(), date.getMonth(), date.getDate(),
            CONFIG.checkTime.hour, CONFIG.checkTime.minute, CONFIG.checkTime.second
        );
    }

    // 下一个尚未到来的签到时间点
    function nextCheckTime() {
        const now = new Date();
        const today = checkTimeOfToday(now);
        if (now.getTime() < today.getTime()) {
            return today;
        }
        return new Date(
            today.getFullYear(), today.getMonth(), today.getDate() + 1,
            CONFIG.checkTime.hour, CONFIG.checkTime.minute, CONFIG.checkTime.second
        );
    }

    // 是否已经过了今天的签到时间点
    function passedCheckTime() {
        return Date.now() >= checkTimeOfToday().getTime();
    }

    /* ==================== 签到状态 ==================== */

    function checkedKey(site) {
        return `ptAttendance:${site.name}:checkedDate`;
    }

    function reloadKey(site) {
        return `ptAttendance:${site.name}:reloadCount`;
    }

    // 今日是否已签到（同时兼容旧版本使用的 localStorage 键）
    function isCheckedToday(site) {
        try {
            if (localStorage.getItem(checkedKey(site)) === todayKey()) {
                return true;
            }
            if (localStorage.getItem('checkedDate') === new Date().toDateString()) {
                return true;
            }
        } catch (e) {
            // 隐私模式下 localStorage 可能不可用
        }
        return false;
    }

    function markChecked(site) {
        try {
            localStorage.setItem(checkedKey(site), todayKey());
        } catch (e) {}
    }

    function unmarkChecked(site) {
        try {
            localStorage.removeItem(checkedKey(site));
        } catch (e) {}
    }

    /* ==================== 签到逻辑 ==================== */

    let failCount = 0;
    let retryTimer = null;

    // 查找页面中的签到入口
    function findSignLink(site) {
        // 用 includes 匹配 href，兼容绝对地址（如 https://pt.btschool.club/index.php?action=addbonus）
        const candidates = Array.from(document.querySelectorAll('a[href]'))
            .filter(a => (a.getAttribute('href') || '').includes(site.attendenceUrl));
        if (!candidates.length) {
            return null;
        }
        const expected = site.attendenceText.trim().toLowerCase();
        // 优先匹配预期文字
        let link = candidates.find(a => a.textContent.trim().toLowerCase().includes(expected));
        // 其次匹配包含“签到”的文字
        if (!link) {
            link = candidates.find(a => a.textContent.includes('签到'));
        }
        // 最后退回唯一候选（图标按钮等无文字的情况）
        if (!link && candidates.length === 1) {
            link = candidates[0];
        }
        return link;
    }

    // 尝试签到，返回今日是否已确认签到
    async function attemptCheckIn(site, reason) {
        if (isCheckedToday(site)) {
            return true;
        }
        if (!passedCheckTime()) {
            // 还没到签到时间点
            return false;
        }

        const link = findSignLink(site);
        if (!link) {
            failCount++;
            warn(`未找到签到按钮（连续第 ${failCount} 次失败，触发来源：${reason}）。`);
            return false;
        }

        const text = link.textContent.trim();
        // 页面已显示“已签到”，说明今天已经完成
        if (text.includes('已签到')) {
            markChecked(site);
            log('检测到今日已签到，记录签到状态。');
            return true;
        }

        // 先写入签到记录再点击：避免点击后页面跳转导致状态丢失
        markChecked(site);
        log('已于', new Date().toLocaleString(), `执行签到点击（触发来源：${reason}，按钮文字：${text}）。`);
        try {
            link.click();
        } catch (e) {
            warn('点击签到按钮出错：', e);
            unmarkChecked(site);
            failCount++;
            return false;
        }
        failCount = 0;
        return true;
    }

    // 统一的签到入口：失败时按退避策略安排重试
    async function tryCheckIn(site, reason) {
        try {
            const done = await attemptCheckIn(site, reason);
            if (!done && passedCheckTime() && !isCheckedToday(site)) {
                scheduleRetry(site);
            }
            return done;
        } catch (e) {
            warn('签到执行出错：', e);
            return false;
        }
    }

    // 失败后按退避策略重试
    function scheduleRetry(site) {
        if (retryTimer) {
            return;
        }
        const delay = Math.min(CONFIG.retryBaseDelay * failCount, CONFIG.retryMaxDelay);
        retryTimer = setTimeout(async () => {
            retryTimer = null;
            const done = await tryCheckIn(site, '失败重试');
            if (!done) {
                maybeReload(site);
            }
        }, delay);
    }

    // 连续多次失败时刷新页面以重新获取签到入口（限制刷新次数，避免无限刷新）
    function maybeReload(site) {
        if (failCount === 0 || failCount % CONFIG.reloadAfterFailures !== 0) {
            return;
        }
        const day = todayKey();
        let reloadState = { day: day, count: 0 };
        try {
            const saved = JSON.parse(sessionStorage.getItem(reloadKey(site)) || 'null');
            if (saved && saved.day === day) {
                reloadState = saved;
            }
        } catch (e) {}
        if (reloadState.count >= CONFIG.maxReloads) {
            warn('刷新次数已达上限，改为持续轮询等待签到入口出现。');
            return;
        }
        reloadState.count++;
        try {
            sessionStorage.setItem(reloadKey(site), JSON.stringify(reloadState));
        } catch (e) {}
        log('多次未找到签到按钮，刷新页面后重试。');
        location.reload();
    }

    /* ==================== 调度 ==================== */

    // 精确触发：尽量在签到时间点准时签到
    function scheduleExactTrigger(site) {
        const next = nextCheckTime();
        const delay = Math.max(next.getTime() - Date.now(), 1000);
        log('下一次精确触发时间：', next.toLocaleString(), `（约 ${Math.round(delay / 1000)} 秒后）。`);
        setTimeout(async () => {
            await tryCheckIn(site, '精确触发');
            scheduleExactTrigger(site);
        }, delay);
    }

    // 轮询兜底：定时器被节流 / 休眠 / 标签页冻结导致错过时间点时，靠它补签
    function schedulePoll(site) {
        setInterval(async () => {
            await tryCheckIn(site, '轮询兜底');
        }, CONFIG.pollInterval);
    }

    function start(site) {
        log('当前站点：', site.name, '|', location.href);

        if (isCheckedToday(site)) {
            log('今日签到已完成，等待下一个签到时间点。');
        } else if (passedCheckTime()) {
            log('已过今日签到时间点但今日尚未签到，立即补签。');
            tryCheckIn(site, '启动补签');
        } else {
            log('尚未到今日签到时间点，等待触发。');
        }

        scheduleExactTrigger(site);
        schedulePoll(site);

        // 页面重新可见 / 窗口重新获得焦点 / 从往返缓存恢复时立即补签一次
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                tryCheckIn(site, '页面重新可见');
            }
        });
        window.addEventListener('focus', () => tryCheckIn(site, '窗口获得焦点'));
        window.addEventListener('pageshow', () => tryCheckIn(site, '页面恢复'));
    }

    /* ==================== 启动 ==================== */

    const localPtSite = ptSites.find(e => {
        const host = location.host;
        return host === e.domain || host.endsWith('.' + e.domain);
    });
    if (!localPtSite) {
        warn('当前站点不在配置列表中，脚本已退出。');
        return;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => start(localPtSite), { once: true });
    } else {
        start(localPtSite);
    }
})();
