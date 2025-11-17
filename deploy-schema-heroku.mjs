import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { migrate } from 'drizzle-orm/mysql2/migrator';

const DATABASE_URL = "mysql://zy0w1n4vq8qs6zt9:z6dqzz4ydoqfh6ow@jj283ocb6p65uqrz.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/yjrqnlhb1nt5xyg0";

async function deploySchema() {
  console.log('Connecting to Heroku database...');
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  
  console.log('Schema deployed successfully!');
  await connection.end();
}

deploySchema().catch(console.error);
