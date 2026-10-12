import mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://patilpalash44_db_user:nQIMo6Y7tCo8YYTV@cluster0.o2ln3ff.mongodb.net/carline';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!');

  const filter = {
    $or: [
      { queueType: { $in: ['BOTH', 'ALL', 'All_Rides', 'both'] } },
      { assignQueue: { $in: ['BOTH', 'ALL', 'All_Rides', 'both'] } },
      { queueType: { $exists: false } },
      { queueType: null },
      { queueType: '' },
    ],
  };

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  const collection = db.collection('drivers');

  const countBefore = await collection.countDocuments({
    ...filter,
    $or: [
      { isLoggedIn: true },
      { isAvailable: true },
      { loginLogout: { $in: ['START', 'LOGIN'] } },
    ],
  });

  console.log(
    `Found ${countBefore} drivers with queue BOTH currently marked online/available/started.`,
  );

  const result = await collection.updateMany(filter, {
    $set: {
      isLoggedIn: false,
      isAvailable: false,
      loginLogout: 'STOP',
    },
  });

  console.log(
    `Successfully reset ${result.modifiedCount} drivers with queue BOTH to offline.`,
  );

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('Error executing reset:', err);
  process.exit(1);
});
