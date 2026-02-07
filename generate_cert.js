const selfsigned = require('selfsigned');
const fs = require('fs');

console.log('Generating self-signed certificates...');
const attrs = [{ name: 'commonName', value: 'localhost' }];

(async () => {
    try {
        // Try await
        let pems = await selfsigned.generate(attrs, { days: 365 });
        console.log('Async result:', Object.keys(pems));

        if (!pems || Object.keys(pems).length === 0) {
            // Fallback sync? No, if await returned empty, sync was probably what happened before.
            // Maybe check if it has a callback interface?
            selfsigned.generate(attrs, { days: 365 }, (err, res) => {
                if (err) console.error('Callback error:', err);
                console.log('Callback result:', res ? Object.keys(res) : 'null');
                if (res) {
                    fs.writeFileSync('server.key', res.private);
                    fs.writeFileSync('server.cert', res.cert);
                    console.log('Certificates generated via callback');
                }
            });
        } else {
            fs.writeFileSync('server.key', pems.private);
            fs.writeFileSync('server.cert', pems.cert);
            console.log('Certificates generated via promise');
        }
    } catch (e) {
        console.error('Error:', e);
    }
})();
