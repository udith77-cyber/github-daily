const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== 日志模块（方案一 卡片风） ====================
const LEVEL_ICON = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    fatal: '💀',
    debug: '🔍',
    step: '▶️',
    done: '✨'
};

function printCard(level, title, details, extra = '') {
    const icon = LEVEL_ICON[level] || '📌';
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = '═══════════════════════════════════════';
    const dash = '───────────────────────────────────────';

    const lines = [];
    lines.push(line);
    lines.push(`  ${icon} ${timestamp}`);
    if (title) lines.push(`  📂 ${title}`);
    if (details) {
        lines.push(dash);
        if (typeof details === 'string') {
            lines.push(`  ${details}`);
        } else if (Array.isArray(details)) {
            details.forEach(d => lines.push(`  ${d}`));
        } else {
            Object.entries(details).forEach(([k, v]) => {
                lines.push(`  ${k}：${v}`);
            });
        }
    }
    if (extra) {
        lines.push(dash);
        lines.push(`  💬 ${extra}`);
    }
    lines.push(line);
    lines.push('');
    return lines.join('\n');
}

function printLine(level, message) {
    const icon = LEVEL_ICON[level] || '•';
    const time = new Date().toISOString().slice(11, 19);
    return `${icon} ${time} ${message}`;
}

const log = {
    card: printCard,
    line: printLine,
    info: (title, details, extra) => console.log(printCard('info', title, details, extra)),
    success: (title, details, extra) => console.log(printCard('success', title, details, extra)),
    warn: (title, details, extra) => console.log(printCard('warn', title, details, extra)),
    error: (title, details, extra) => console.log(printCard('error', title, details, extra)),
    done: (title, details, extra) => console.log(printCard('done', title, details, extra)),
    step: (msg) => console.log(printLine('step', msg)),
    debug: (msg) => console.log(printLine('debug', msg)),
};
// ==================== 日志模块结束 ====================

// ==================== 配置常量 ====================
const AES_KEY = '999f75dcb1b89a6c528dfn33df4f70d1';
const AES_IV = '5k2f5cjt9a4c1c99';
const OSS_CONFIG_URL = 'https://qiyuqiyu.oss-ap-northeast-1.aliyuncs.com/200255.log';
const API_BASE_FALLBACK = 'http://8.210.52.158/apiV2';
let API_BASE = API_BASE_FALLBACK;

const PASTEBIN_API_URL = 'https://shz.6670088.xyz/';
const CLASH_SUB_TEMPLATE = 'https://api.v1.mk/sub?target=clash&config=https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/refs/heads/master/Clash/config/ACL4SSR_Online_Mini.ini&insert=false&emoji=true&list=false&xudp=true&udp=true&tfo=true&expand=true&scv=false&fdn=false&clash.doh=true&new_name=true&diyua=ShadowRocket&url=%s';

// ==================== 核心函数 ====================
function fetchApiBase() {
    return new Promise((resolve) => {
        const req = https.get(OSS_CONFIG_URL, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).log || API_BASE_FALLBACK);
                } catch {
                    resolve(API_BASE_FALLBACK);
                }
            });
        });
        // GitHub Actions 无人值守：15 秒没响应就放弃，用备用地址，避免任务无限挂起
        req.setTimeout(15000, () => {
            req.destroy();
            resolve(API_BASE_FALLBACK);
        });
        req.on('error', () => resolve(API_BASE_FALLBACK));
    });
}

function decryptResponse(b64) {
    const d = crypto.createDecipheriv('aes-256-cbc', Buffer.from(AES_KEY), Buffer.from(AES_IV));
    return Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]).toString('utf8');
}

function encryptRequest(json) {
    const c = crypto.createCipheriv('aes-256-cbc', Buffer.from(AES_KEY), Buffer.from(AES_IV));
    return Buffer.concat([c.update(Buffer.from(json, 'utf8')), c.final()]).toString('base64');
}

function post(apiPath, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = API_BASE + apiPath;
        const proto = url.startsWith('https') ? https : http;
        const req = proto.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': '0',
                ...headers
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        // GitHub Actions 无人值守：20 秒没响应就直接报错，避免任务无限挂起
        req.setTimeout(20000, () => req.destroy(new Error('请求超时')));
        req.on('error', reject);
        req.end();
    });
}

function parseResponse(raw) {
    try {
        return JSON.parse(decryptResponse(raw));
    } catch (e) {
        try {
            return JSON.parse(raw);
        } catch {
            return {
                raw,
                error: e.message
            };
        }
    }
}

async function travelerLogin(deviceId, token = '') {
    const raw = await post('/traveler_login', {
        deviceId,
        devicetype: '2',
        devicename: 'iPhone',
        language: '1',
        authtoken: token,
        token,
    });
    return parseResponse(raw);
}

async function info(authtoken, jwt, deviceId) {
    const raw = await post('/info', {
        deviceId,
        devicetype: '2',
        devicename: 'iPhone',
        language: '1',
        authtoken,
        token: jwt,
    });
    return parseResponse(raw);
}

async function nodeList(authtoken, jwt, deviceId) {
    const raw = await post('/node_list', {
        deviceId,
        devicetype: '2',
        devicename: 'iPhone',
        language: '1',
        authtoken,
        token: jwt,
    });
    return parseResponse(raw);
}

/**
 * 将 Base64 内容上传到 Pastebin 并获取分享链接
 */
function uploadToPastebin(base64Content, options = {}) {
    return new Promise((resolve, reject) => {
        const boundary = '----NodeJSFormBoundary' + Date.now();
        let postData = '';

        const appendField = (name, value) => {
            postData += `--${boundary}\r\n`;
            postData += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
            postData += `${value}\r\n`;
        };

        appendField('c', base64Content);
        if (options.expiration) appendField('e', options.expiration);
        if (options.password) appendField('s', options.password);
        if (options.customName) appendField('n', options.customName);
        if (options.private) appendField('p', '1');
        if (options.lang) appendField('lang', options.lang);
        if (options.encryptionScheme) appendField('encryption-scheme', options.encryptionScheme);

        postData += `--${boundary}--\r\n`;

        const urlObj = new URL(PASTEBIN_API_URL);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = protocol.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.url) {
                        log.success('Pastebin 上传', {
                            '分享链接': response.url,
                            '管理链接': response.manageUrl || '无'
                        });
                        resolve(response.url);
                    } else {
                        reject(new Error(`上传失败，服务器响应: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`解析响应失败: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * 生成 Clash 订阅链接
 */
function generateClashSubscribeUrl(originalUrl) {
    const encodedUrl = encodeURIComponent(originalUrl);
    return CLASH_SUB_TEMPLATE.replace('%s', encodedUrl);
}

/**
 * 处理节点并生成 Clash 订阅链接
 */
async function processNodesToClashUrl(nodes) {
    try {
        if (!nodes || nodes.length === 0) {
            log.warn('节点处理', '节点列表为空');
            return null;
        }

        const nodesText = nodes.join('\n');
        const base64Content = Buffer.from(nodesText, 'utf8').toString('base64');
        log.debug(`节点数量: ${nodes.length}, Base64 长度: ${base64Content.length} 字符`);

        log.step('正在上传到 Pastebin...');
        const shareUrl = await uploadToPastebin(base64Content);

        const clashUrl = generateClashSubscribeUrl(shareUrl);
        log.success('Clash 订阅链接已生成');
        return clashUrl;
    } catch (err) {
        log.error('处理失败', err.message);
        return null;
    }
}

// ==================== 主函数 ====================
async function main() {
    log.info('系统初始化', { '正在获取 API 地址...': '请稍候' });

    API_BASE = await fetchApiBase();
    log.success('API 配置', { 'API 地址': API_BASE });

    const deviceId = crypto.randomUUID();
    log.step('正在登录...');

    const loginRes = await travelerLogin(deviceId);
    if (!loginRes.data?.token) {
        log.error('登录失败', '请检查网络或服务状态');
        process.exitCode = 1;
        return;
    }

    const { token: authtoken, auth_data: jwt } = loginRes.data;
    log.success('登录成功', {
        'authtoken': authtoken.slice(0, 20) + '…'
    });

    log.step('正在获取用户信息...');
    const infoRes = await info(authtoken, jwt, deviceId);
    if (infoRes.data) {
        log.success('用户信息', {
            '用户': infoRes.data.username || '未知',
            '等级': infoRes.data.level || 'N/A',
            '剩余流量': infoRes.data.remain_traffic || 'N/A'
        });
    } else {
        log.warn('用户信息', '获取用户信息失败或数据不完整');
    }

    log.step('正在拉取节点列表...');
    const nodeRes = await nodeList(authtoken, jwt, deviceId);

    if (nodeRes.data && Array.isArray(nodeRes.data)) {
        const allNodes = nodeRes.data.flatMap(g => g.node || []);
        log.success('节点列表', {
            '节点总数': allNodes.length,
            '分组数': nodeRes.data.length
        });

        log.step('正在生成 Clash 订阅链接...');
        const clashUrl = await processNodesToClashUrl(allNodes);

        if (clashUrl) {
            const clashLinkFile = path.join(path.dirname(process.argv[1]), 'clash_subscribe_link.txt');
            fs.writeFileSync(clashLinkFile, clashUrl, 'utf8');

            log.done('全部完成！', {
                '订阅链接': clashUrl,
                '保存位置': clashLinkFile
            });

            console.log(`\n🔗 ${clashUrl}\n`);
        } else {
            log.error('生成失败', '请检查网络连接');
            process.exitCode = 1;
        }
    } else {
        log.error('获取节点列表失败', JSON.stringify(nodeRes, null, 2));
        process.exitCode = 1;
    }
}

// ==================== 执行入口 ====================
if (require.main === module) {
    main().catch(e => {
        log.fatal('致命错误', e.message);
        console.error(e.stack);
        process.exitCode = 1;
    });
}

// ==================== 导出 ====================
module.exports = {
    decryptResponse,
    encryptRequest,
    travelerLogin,
    info,
    nodeList,
    uploadToPastebin,
    generateClashSubscribeUrl,
    processNodesToClashUrl
};
