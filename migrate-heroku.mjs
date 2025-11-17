import mysql from 'mysql2/promise';

const DATABASE_URL = "mysql://zy0w1n4vq8qs6zt9:z6dqzz4ydoqfh6ow@jj283ocb6p65uqrz.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/yjrqnlhb1nt5xyg0";

async function migrateSchema() {
  console.log('Connecting to Heroku database...');
  const connection = await mysql.createConnection(DATABASE_URL);
  
  try {
    console.log('Creating uploadedFiles table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS uploadedFiles (
        id int AUTO_INCREMENT PRIMARY KEY,
        filename varchar(255) NOT NULL,
        originalFilename varchar(255) NOT NULL,
        fileType varchar(100) NOT NULL,
        fileSize int NOT NULL,
        s3Key varchar(512) NOT NULL,
        s3Url varchar(1024) NOT NULL,
        uploadedBy int,
        uploadedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description text,
        FOREIGN KEY (uploadedBy) REFERENCES users(id)
      )
    `);
    
    console.log('✅ Schema migration completed successfully!');
    
    console.log('\nFetching uploaded files...');
    const [files] = await connection.execute(
      'SELECT id, filename, originalFilename, s3Url, uploadedAt FROM uploadedFiles ORDER BY uploadedAt DESC LIMIT 5'
    );
    
    if (files.length > 0) {
      console.log('\n📁 Uploaded files:');
      files.forEach(file => {
        console.log(`\nFile ID: ${file.id}`);
        console.log(`  Original: ${file.originalFilename}`);
        console.log(`  Uploaded: ${file.uploadedAt}`);
        console.log(`  Public URL: https://climate-risk-dash-40e3582ff948.herokuapp.com/public/files/${file.id}`);
      });
    } else {
      console.log('\n📭 No files uploaded yet.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

migrateSchema();
