import mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://patilpalash44_db_user:nQIMo6Y7tCo8YYTV@cluster0.o2ln3ff.mongodb.net/carline';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  const tripNumber = 'TRIP-300580-806';
  const nowIso = new Date().toISOString();

  console.log(`Resolving ride ${tripNumber}...`);
  const rideResult = await db.collection('rides').updateOne(
    { tripNumber },
    {
      $set: {
        selectedZone: 'ZONE_1',
        originalCalculatedFare: 18,
        rideAmount: 18,
        rideStatus: 'COMPLETED',
        paymentStatus: 'COMPLETED',
        paymentType: 'CASH',
        payment: 'CASH',
        ridePaymentDateTime: nowIso,
        updatedAt: new Date(),
      },
    },
  );

  console.log(`Updated ride ${tripNumber}: modified ${rideResult.modifiedCount} document(s).`);

  const driverPhone = '8455025990';
  console.log(`Clearing active ride from driver ${driverPhone}...`);
  const driverResult = await db.collection('drivers').updateOne(
    {
      $or: [
        { mobileNumber: driverPhone },
        { mobileNumber: `+1${driverPhone}` },
        { mobileNumber: { $regex: `${driverPhone}$` } },
      ],
    },
    {
      $set: {
        activeRideId: '',
        ongoingRides: 'NO',
      },
    },
  );

  console.log(`Cleared driver ${driverPhone}: modified ${driverResult.modifiedCount} document(s).`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Error resolving ride:', err);
  process.exit(1);
});
