import mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://patilpalash44_db_user:nQIMo6Y7tCo8YYTV@cluster0.o2ln3ff.mongodb.net/carline';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const driverPhone = '8455025990';
  const tripNumber = 'TRIP-300580-806';

  console.log('--- DRIVER DETAILS ---');
  const driver = await db.collection('drivers').findOne({
    $or: [
      { mobileNumber: driverPhone },
      { mobileNumber: `+1${driverPhone}` },
      { mobileNumber: { $regex: `${driverPhone}$` } },
    ],
  });

  if (!driver) {
    console.log('Driver not found for phone:', driverPhone);
  } else {
    console.log({
      _id: driver._id,
      driverName: driver.driverName,
      mobileNumber: driver.mobileNumber,
      status: driver.status,
      isLoggedIn: driver.isLoggedIn,
      isAvailable: driver.isAvailable,
      loginLogout: driver.loginLogout,
      ongoingRides: driver.ongoingRides,
      activeRideId: driver.activeRideId,
      queueType: driver.queueType,
      assignQueue: driver.assignQueue,
    });
  }

  console.log('\n--- RIDE 6417 DETAILS ---');
  const ride = await db.collection('rides').findOne({ tripNumber });
  if (!ride) {
    console.log('Ride not found for tripNumber:', tripNumber);
  } else {
    console.log({
      _id: ride._id,
      rideId: ride.rideId,
      tripNumber: ride.tripNumber,
      customerNumber: ride.customerNumber,
      driverName: ride.driverName,
      driverNumber: ride.driverNumber,
      driverId: ride.driverId,
      rideStatus: ride.rideStatus,
      paymentStatus: ride.paymentStatus,
      paymentType: ride.paymentType,
      selectedZone: ride.selectedZone,
      rideAmount: ride.rideAmount,
      rideStartDateTime: ride.rideStartDateTime,
      rideCompleteDateTime: ride.rideCompleteDateTime,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    });
  }

  console.log('\n--- ANY SUBSEQUENT RIDES FOR THIS DRIVER TODAY ---');
  if (driver) {
    const driverIdStr = driver._id.toString();
    const otherRides = await db
      .collection('rides')
      .find({
        $or: [
          { driverId: driverIdStr },
          { driverNumber: driver.mobileNumber },
        ],
        createdAt: { $gte: new Date('2026-10-12T00:00:00.000Z') },
      })
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`Found ${otherRides.length} rides for this driver today:`);
    for (const r of otherRides) {
      console.log(
        `- #${r.rideId} (${r.tripNumber}): status=${r.rideStatus}, payment=${r.paymentStatus}, fare=${r.rideAmount}, zone=${r.selectedZone}, created=${r.createdAt}`,
      );
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
