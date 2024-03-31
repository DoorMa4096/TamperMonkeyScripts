// ==UserScript==
// @name         google location auto update
// @namespace    http://tampermonkey.net/
// @version      0.4.1
// @description  update google location automatically
// @author       Door Ma
// @match        https://www.google.com/search?q=*
// @match        https://bard.google.com/chat*
// @match        https://gemini.google.com/app*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 对于 search 的提交时间间隔
    setInterval(function() {
        if (window.location.href.includes('www.google.com/search?q=')) {
            let element_search = document.querySelector('update-location');
            if (element_search) {
                element_search.click();
            } else {
                console.log('未找到更新按钮');
                alert('未找到更新按钮');
            }
        }
    }, 60000); // 毫秒，执行一次位置提交

    // 对于 gemini 的提交时间间隔
    setInterval(function() {
        if (window.location.href.includes('gemini.google.com/app')) {
            let element_gemini = document.querySelector('.update-location-text.location-clickable');
            if (element_gemini) {
                element_gemini.click();
            } else {
                console.log('未找到更新按钮');
                alert('未找到更新按钮');
            }
        }
    }, 3600000); // 毫秒，执行一次位置提交

})();
