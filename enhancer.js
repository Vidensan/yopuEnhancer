// ==UserScript==
// @name         有谱么 (Yoopu) 移除试听限制
// @namespace    https://github.com/Vidensan/yopuEnhancer
// @version      2.1
// @description  移除有谱么网页版的15秒试听限制，支持完整播放吉他谱、尤克里里谱及钢琴谱。仅供个人学习交流使用。
// @author       Vidensan
// @match        https://yopu.co/view/*
// @grant        none
// @run-at       document-start
// @license      MIT
// @supportURL   https://github.com/Vidensan/yopuEnhancer/issues
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[Yoopu Enhancer]';
    console.log(`${LOG_PREFIX} 脚本已加载，正在移除试听限制...`);

    // --- 核心补丁：拦截试听定时器 ---
    // 有谱么通过 setTimeout 实现 15 秒后暂停。我们拦截它。
    const _setTimeout = window.setTimeout;
    const _clearTimeout = window.clearTimeout;
    const blockedTimers = new Set();

    window.setTimeout = function (callback, delay, ...args) {
        // 识别有谱么的试听定时器特征
        // 15秒 (吉他/尤克里里), 3秒 (架子鼓), 1ms (防止重复播放的锁)
        if (delay === 15000 || delay === 3000 || delay === 1) {
            const fnString = callback.toString();
            // 特征匹配：检测是否有埋点上报或试听相关的字符串
            if (fnString.includes('有声谱播放') || fnString.includes('trial')) {
                // console.log(`${LOG_PREFIX} 已拦截试听定时器 (${delay}ms)`);
                const fakeId = Math.random() * -1000000; // 返回一个无效的ID
                blockedTimers.add(fakeId);
                return fakeId;
            }
        }
        return _setTimeout(callback, delay, ...args);
    };

    window.clearTimeout = function (id) {
        if (blockedTimers.has(id)) {
            // console.log(`${LOG_PREFIX} 忽略对已拦截定时器的清除`);
            blockedTimers.delete(id);
            return;
        }
        return _clearTimeout(id);
    };

    // --- 辅助补丁：修复 Svelte 状态 ---
    // 防止页面逻辑强制将播放状态设置为 false
    function patchSvelteInstance(instance) {
        if (instance && instance.$$ && instance.$$.update) {
            const originalUpdate = instance.$$.update;
            instance.$$.update = function (...args) {
                // 调用原始的更新逻辑
                originalUpdate.apply(this, args);

                const ctx = this.$$.ctx;
                if (!ctx) return;

                // 遍历上下文，寻找布尔类型的播放状态标志并锁定为 true
                // 同时也寻找并清除 "已触发试听结束" 的标志
                for (let i = 0; i < ctx.length; i++) {
                    if (ctx[i] === false) {
                        // 尝试强制修正可能为播放状态的 false
                        // 这是一个启发式策略，因为混淆后的索引不固定
                        ctx[i] = true;
                    }
                }
            };
            return true;
        }
        return false;
    }

    // --- 动态挂载 ---
    const observer = new MutationObserver(() => {
        // 尝试寻找 Svelte 的根组件
        // Svelte 通常会将 __svelte 属性挂在 DOM 节点上
        document.querySelectorAll('body *').forEach(node => {
            if (node.__svelte && !node.__patched_by_yoopu_enhancer) {
                if (patchSvelteInstance(node.__svelte)) {
                    node.__patched_by_yoopu_enhancer = true;
                    console.log(`${LOG_PREFIX} 成功挂载到 Svelte 组件`);
                }
            }
        });
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // --- AlphaTab 兼容 ---
    // 确保 AlphaTab 播放器处于启用状态
    const checkAlphaTab = setInterval(() => {
        if (window.alphaTab && window.alphaTab.AlphaTabApi) {
            try {
                const proto = window.alphaTab.AlphaTabApi.prototype;
                if (!proto.play.__patched) {
                    const originalPlay = proto.play;
                    proto.play = function () {
                        if (this.settings && this.settings.player) {
                            this.settings.player.enablePlayer = true;
                        }
                        return originalPlay.apply(this, arguments);
                    };
                    proto.play.__patched = true;
                    console.log(`${LOG_PREFIX} AlphaTab 播放器已优化`);
                }
                clearInterval(checkAlphaTab);
            } catch (e) {
                // ignore
            }
        }
    }, 1000);

    // 清理
    setTimeout(() => clearInterval(checkAlphaTab), 30000);

    console.log(`${LOG_PREFIX} 初始化完成。享受音乐吧！`);

})();
