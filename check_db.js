const db = require('./db');
db.query('DESCRIBE reclamations', (err, rows) => {
    console.log('--- RECLAMATIONS ---');
    console.log(rows);
    db.query('DESCRIBE users', (err, rows) => {
        console.log('--- USERS ---');
        console.log(rows);
        process.exit();
    });
});
