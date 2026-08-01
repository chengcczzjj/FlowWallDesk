function initComponentsUI() {
    // 确保主文档中引入了相应的CSS
    if (!document.querySelector('link[href="components.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'components.css';
        document.head.appendChild(link);
    }

    const containerId = 'page-components';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'page';
        document.querySelector('.page-content').appendChild(container);
    }

    // 组件页面的基本HTML结构: 全新的 WinUI 网格卡片风格
    container.innerHTML = `
        <div class="components-container">
            <div class="components-main-area">

                <div class="section-label">悬浮挂件</div>
                <div class="nobg-grid">
                    <!-- Widget: Time (Dynamic) -->
                    <div class="comp-card" style="width: 320px; height: 160px; background: transparent; box-shadow: none;">
                        <div class="comp-content" style="padding: 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; flex: 1; text-align: center;">
                            <div class="comp-nobg-text" id="demo-time" style="color: var(--text-primary); text-shadow: none;">10:45</div>
                            <div style="margin-top: 8px; font-size: 16px; opacity: 0.7; color: var(--text-primary); font-weight: 500;">4月17日 星期五</div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-prev" title="上一个样式"><span class="icon">&#xE76B;</span></button>
                            <button class="comp-hover-btn btn-next" title="下一个样式"><span class="icon">&#xE76C;</span></button>
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>
                    
                    <!-- Widget: Audio Visualizer -->
                    <div class="comp-card" style="width: 320px; height: 160px; background: transparent; box-shadow: none;">
                        <div class="comp-content" style="padding: 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; flex: 1;">
                            <div class="comp-nobg-text" style="font-size: 28px; letter-spacing: 6px; margin-bottom: 12px; color: var(--accent); text-shadow: none;">ılılıllıılılıllı</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">频谱响应区</div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-prev" title="上一个样式"><span class="icon">&#xE76B;</span></button>
                            <button class="comp-hover-btn btn-next" title="下一个样式"><span class="icon">&#xE76C;</span></button>
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: Floating Text -->
                    <div class="comp-card" style="width: 480px; height: 160px; background: transparent; box-shadow: none;">
                        <div class="comp-content" style="padding: 24px; display:flex; flex-direction:column; align-items:flex-end; justify-content:center; flex: 1; text-align: right;">
                            <div class="comp-nobg-text" style="font-size: 32px; font-weight: 600; color: var(--text-primary); text-shadow: none;">"Stay Hungry, Stay Foolish."</div>
                            <div style="font-size: 14px; opacity: 0.6; margin-top: 12px; color: var(--text-primary);">— Steve Jobs</div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-prev" title="上一个样式"><span class="icon">&#xE76B;</span></button>
                            <button class="comp-hover-btn btn-next" title="下一个样式"><span class="icon">&#xE76C;</span></button>
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>
                </div>

                <div class="section-label" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>卡片组件</span>
                    <button class="comp-btn btn-secondary" onclick="openComponentSettings('cards')" style="font-size: 13px; padding: 6px 12px; color: var(--text-primary); border-color: var(--border-control);">
                        <span class="icon">&#xE713;</span> 全局卡片设置
                    </button>
                </div>
                <div class="component-grid">

                    <!-- Widget: Weather 2x2 -->
                    <div class="comp-card size-2x2" style="background: linear-gradient(180deg, #1A4073 0%, #152E58 100%); color: white;">
                        <div class="comp-content" style="padding: 20px; flex: 1;">
                            <div style="display:flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                                <div style="display:flex; align-items: center; gap: 8px;"><span class="icon">&#xE706;</span> 北京市 <span class="icon" style="font-size:12px;">&#xE70D;</span></div>
                                <span class="icon">&#xE712;</span>
                            </div>
                            <div style="display:flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 20px;">
                                <span class="icon" style="font-size: 64px; color:#FDB813; margin-bottom: -10px;">&#xE706;</span>
                                <div style="font-size: 48px; font-weight: 600; line-height: 1;">13°C</div>
                                <div style="font-size: 14px; opacity: 0.8; text-align: center;">外边能见度低<br>能见度0.4公里</div>
                            </div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: Stocks 1x2 -->
                    <div class="comp-card size-1x2" style="background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);">
                        <div class="comp-content" style="padding: 16px; flex: 1;">
                            <div style="display:flex; align-items: center; gap: 8px; margin-bottom: 16px; font-weight: 600; color: var(--success);"><span class="icon">&#xE8EE;</span> 自选股</div>
                            
                            <div style="margin-bottom: 16px;">
                                <div style="font-size: 14px; font-weight: 600;">贵州茅台</div>
                                <div style="font-size: 18px; font-weight: bold; margin: 4px 0;">1,463.70</div>
                                <div style="font-size: 12px; color: var(--success);">-0.26%</div>
                            </div>
                            <div style="height: 1px; background: var(--border-subtle); margin-bottom: 16px;"></div>
                            <div style="margin-bottom: 16px;">
                                <div style="font-size: 14px; font-weight: 600;">上证指数</div>
                                <div style="font-size: 18px; font-weight: bold; margin: 4px 0;">4,055.55</div>
                                <div style="font-size: 12px; color: var(--error);">+0.70%</div>
                            </div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: News 3x2 -->
                    <div class="comp-card size-3x2" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
                        <div class="comp-content" style="display: flex; flex-direction: row; height: 100%;">
                            <div style="flex: 2; background: url('assets/wallpapers/preview-bg.jpg') center/cover; position: relative;">
                                <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 24px; background: linear-gradient(0deg, rgba(0,0,0,0.8), transparent); color: white;">
                                    <div style="font-weight: 600; font-size: 20px; line-height: 1.4;">央视重磅推出：今年全球科技最新突破前百名出炉！带你详细解读</div>
                                    <div style="font-size: 12px; opacity: 0.8; margin-top: 8px;">新闻 · 9小时前</div>
                                </div>
                            </div>
                            <div style="flex: 1; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border-left: 1px solid var(--border-subtle); background: var(--bg-solid);">
                                <div>
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">热门榜单</div>
                                    <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">1. GPT-5 将于近日开发布会宣布新能力</div>
                                    <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">2. 同济通报一教师论文数据存疑</div>
                                    <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">3. 140年来最强极光即将降临</div>
                                </div>
                                <div style="font-size: 12px; color: var(--accent); cursor: pointer;">查看更多 &gt;</div>
                            </div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: Calendar 1x1 -->
                    <div class="comp-card size-1x1" style="background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);">
                        <div class="comp-content" style="padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <div style="font-size: 14px; font-weight: 600; color: var(--error); margin-bottom: 8px;">星期五</div>
                            <div style="font-size: 48px; font-weight: bold; line-height: 1; margin-bottom: 8px;">17</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">农历三月廿九</div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: Quick Tools 2x1 -->
                    <div class="comp-card size-2x1" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
                        <div class="comp-content" style="padding: 24px; display: flex; justify-content: space-around; align-items: center; color: var(--text-secondary);">
                            <div style="display:flex; flex-direction:column; align-items:center; cursor: pointer;">
                                <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-solid); display:flex; align-items:center; justify-content:center; margin-bottom:8px; border: 1px solid var(--border-control);"><span class="icon" style="font-size: 20px;">&#xE7DF;</span></div>
                                <div style="font-size: 12px;">便签</div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; cursor: pointer;">
                                <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-solid); display:flex; align-items:center; justify-content:center; margin-bottom:8px; border: 1px solid var(--border-control);"><span class="icon" style="font-size: 20px; color: var(--success);">&#xE894;</span></div>
                                <div style="font-size: 12px;">截图</div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; cursor: pointer;">
                                <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-solid); display:flex; align-items:center; justify-content:center; margin-bottom:8px; border: 1px solid var(--border-control);"><span class="icon" style="font-size: 20px; color: var(--accent);">&#xE713;</span></div>
                                <div style="font-size: 12px;">设置</div>
                            </div>
                             <div style="display:flex; flex-direction:column; align-items:center; cursor: pointer;">
                                <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-solid); display:flex; align-items:center; justify-content:center; margin-bottom:8px; border: 1px solid var(--border-control);"><span class="icon" style="font-size: 20px; color: var(--error);">&#xEC59;</span></div>
                                <div style="font-size: 12px;">重启</div>
                            </div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: Pet/Mascot 1x1 -->
                    <div class="comp-card size-1x1" style="background: #FDF9F3; border: 1px solid var(--border-subtle);">
                        <div class="comp-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <img src="../src/FlowWallDesk.UI.WinUI/Assets/icon-FlowWallDesk-48.png" style="width: 64px; margin-bottom: 12px;">
                            <div style="font-size: 14px; font-weight: 600; color: #5C4B3E;">桌面萌宠</div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                    <!-- Widget: CPU Monitor 2x1 -->
                    <div class="comp-card size-2x1" style="background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);">
                        <div class="comp-content" style="padding: 20px; flex: 1; display:flex; flex-direction: column; justify-content: center;">
                            <div style="display:flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; font-weight: 600;">
                                <span><span class="icon" style="margin-right:6px;">&#xE968;</span>CPU Util</span>
                                <span>34%</span>
                            </div>
                            <div style="width: 100%; height: 8px; border-radius: 4px; background: var(--border-control); margin-bottom: 16px; overflow: hidden;">
                                <div style="width: 34%; height: 100%; background: var(--accent);"></div>
                            </div>
                            
                            <div style="display:flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; font-weight: 600;">
                                <span><span class="icon" style="margin-right:6px;">&#xE964;</span>Memory</span>
                                <span>12.4 GB / 32.0 GB</span>
                            </div>
                            <div style="width: 100%; height: 8px; border-radius: 4px; background: var(--border-control); overflow: hidden;">
                                <div style="width: 40%; height: 100%; background: var(--warning);"></div>
                            </div>
                        </div>
                        <div class="comp-hover-actions">
                            <button class="comp-hover-btn btn-add" title="添加到桌面" onclick="alert('已添加到桌面')"><span class="icon">&#xE710;</span></button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;

    // 注入供特殊组件使用的设置弹窗
    if (!document.getElementById('dialog-comp-settings')) {
        const dialogHtml = `
        <div class="dialog-overlay" id="dialog-comp-settings">
            <div class="dialog" style="min-width:420px;">
                <div class="dialog__header" id="comp-settings-title">组件设置</div>
                <div class="dialog__body" id="comp-settings-body">
                    <!-- 内容动态填充 -->
                </div>
                <div class="dialog__footer">
                    <button class="btn" onclick="closeDialog('dialog-comp-settings')">取消</button>
                    <button class="btn btn--accent" onclick="saveCompSettings()">应用</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
    }
}

window.updateCompGlobalStyles = function () {
    let color = document.getElementById('comp-bg-color')?.value || '#ffffff';
    let opacity = parseInt(document.getElementById('comp-bg-opacity')?.value || 60);
    let blur = parseInt(document.getElementById('comp-bg-blur')?.value || 16);
    let saturate = parseInt(document.getElementById('comp-bg-saturate')?.value || 100);
    let radius = parseInt(document.getElementById('comp-bg-radius')?.value || 16);

    // Convert hex color + opacity to rgba
    let hex = color.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    let a = (opacity / 100).toFixed(2);

    let styleEl = document.getElementById('comp-dynamic-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'comp-dynamic-style';
        document.head.appendChild(styleEl);
    }

    styleEl.innerHTML = `
        .comp-card:not([style*="transparent"]) {
            background: rgba(${r}, ${g}, ${b}, ${a}) !important;
            backdrop-filter: blur(${blur}px) saturate(${saturate}%) !important;
            -webkit-backdrop-filter: blur(${blur}px) saturate(${saturate}%) !important;
            border-radius: ${radius}px !important;
        }
    `;
};

window.openComponentSettings = function (type) {
    const titleEl = document.getElementById('comp-settings-title');
    const bodyEl = document.getElementById('comp-settings-body');

    if (type === 'cards') {
        titleEl.textContent = '设置: 全局卡片外观';
        bodyEl.innerHTML = `
            <div class="settings-group" style="margin-bottom: 16px;">
                <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">全局底板玻璃特效 (毛玻璃)</div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">背景颜色/色调</span>
                    <input type="color" id="comp-bg-color" value="#ffffff" style="background:none; border:none; height:28px; width:48px;" oninput="updateCompGlobalStyles()">
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">不透明度 (Opacity) : <span id="val-opacity">60</span>%</span>
                    <input type="range" id="comp-bg-opacity" min="0" max="100" value="60" style="flex:1; margin-left: 24px;" oninput="document.getElementById('val-opacity').textContent=this.value; updateCompGlobalStyles()">
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">模糊半径 (Blur Radius) : <span id="val-blur">16</span>px</span>
                    <input type="range" id="comp-bg-blur" min="0" max="40" value="16" style="flex:1; margin-left: 24px;" oninput="document.getElementById('val-blur').textContent=this.value; updateCompGlobalStyles()">
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">饱和度 (Saturation) : <span id="val-saturate">150</span>%</span>
                    <input type="range" id="comp-bg-saturate" min="0" max="300" value="150" style="flex:1; margin-left: 24px;" oninput="document.getElementById('val-saturate').textContent=this.value; updateCompGlobalStyles()">
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">卡片圆角</span>
                    <select class="combo-box" id="comp-bg-radius" style="width: 180px;" onchange="updateCompGlobalStyles()">
                        <option value="0">直角 (0px)</option>
                        <option value="4">小圆角 (4px)</option>
                        <option value="8">中圆角 (8px)</option>
                        <option value="16" selected>大圆角 (16px)</option>
                    </select>
                </div>
            </div>
        `;
    } else {
        titleEl.textContent = type === 'time' ? '设置: 数字时间' : (type === 'text' ? '设置: 桌面文字' : '设置: 音频可视化');

        bodyEl.innerHTML = `
            <div class="settings-group" style="margin-bottom: 16px;">
                <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">排版与字体</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">字体家族</span>
                    <select class="combo-box" style="width: 180px;">
                        <option>Segoe UI</option>
                        <option>Consolas</option>
                        <option>Arial</option>
                    </select>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">字体大小</span>
                    <input type="range" min="12" max="64" value="24" style="flex:1; margin-left: 24px;">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">字体粗细</span>
                    <select class="combo-box" style="width: 180px;">
                        <option value="300">Light</option>
                        <option selected value="400">Regular</option>
                        <option value="600">SemiBold</option>
                        <option value="700">Bold</option>
                    </select>
                </div>
            </div>

            <div class="settings-group" style="margin-bottom: 16px;">
                <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">颜色与特效</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">主体颜色</span>
                    <input type="color" value="#ffffff" style="background:none; border:none; height:28px;">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:14px;">阴影透明度</span>
                    <input type="range" min="0" max="100" value="50" style="flex:1; margin-left: 24px;">
                </div>
            </div>
        `;
    }

    // 假设 index.html/app.js 中已经存在全局的 openDialog 方法
    if (typeof window.openDialog === 'function') {
        window.openDialog('dialog-comp-settings');
    }
}

window.saveCompSettings = function () {
    // 模拟保存逻辑
    if (typeof window.closeDialog === 'function') {
        window.closeDialog('dialog-comp-settings');
    }
}
