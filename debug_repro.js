const http = require('http');

function request(path, options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/api/panchuko/' + encodeURIComponent(path),
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(data || '{}') }));
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    const PATH = 'debug-unicode-test';
    const PASS_UNICODE = '⚠️secret';

    console.log(`1. Setting lock with unicode "${PASS_UNICODE}"...`);
    await request(PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        content: 'secret content',
        newPassword: PASS_UNICODE,
        password: ''
    });

    console.log(`2. Accessing with "${PASS_UNICODE}" in header...`);
    try {
        const res1 = await request(PATH, {
            method: 'GET',
            // Node/HTTP might throw here if we try to put unicode in header directly
            headers: { 'x-password': PASS_UNICODE }
        });
        console.log(`Status: ${res1.statusCode} (If 401, hypothesis confirmed)`);
    } catch (e) {
        console.log('Request failed (Validation error?):', e.message);
    }
}

test().catch(console.error);
