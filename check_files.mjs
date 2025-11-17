import mysql from 'mysql2/promise';

async function checkFiles() {
  const connection = await mysql.createConnection({
    host: 'jj283ocb6p65uqrz.cbetxkdyhwsb.us-east-1.rds.amazonaws.com',
    user: 'zy0w1n4vq8qs6zt9',
    password: 'z6dqzz4ydoqfh6ow',
    database: 'yjrqnlhb1nt5xyg0'
  });
  
  try {
    const [rows] = await connection.execute('SELECT id, filename, originalFilename, s3Url, uploadedAt FROM uploadedFiles ORDER BY uploadedAt DESC LIMIT 5');
    console.log('Uploaded files:', JSON.stringify(rows, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkFiles();
