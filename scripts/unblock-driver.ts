import mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://patilpalash44_db_user:nQIMo6Y7tCo8YYTV@cluster0.o2ln3ff.mongodb.net/carline';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  const collection = db.collection('drivers');

  const phoneQuery = {
    $or: [
      { mobileNumber: '8455378544' },
      { mobileNumber: '+18455378544' },
      { mobileNumber: { $regex: '8455378544$' } },
    ],
  };

  const driverBefore = await collection.findOne(phoneQuery);
  if (!driverBefore) {
    console.log('Driver with phone 8455378544 not found!');
  } else {
    console.log(
      `Found driver: ${driverBefore.driverName} (Status: ${driverBefore.status})`,
    );

    const result = await collection.updateOne(phoneQuery, {
      $set: {
        status: 'Active',
      },
    });

    console.log(
      `Updated ${result.modifiedCount} driver(s). Status is now 'Active'.`,
    );
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('Error unblocking driver:', err);
  process.exit(1);
});
