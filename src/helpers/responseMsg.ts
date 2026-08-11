export const Msg = {
  // General
  SERVER_ERROR: `Internal server error`,
  SUCCESS: `Success`,
  VALIDATION_ERROR: `Validation failed`,
  BAD_REQUEST: `Bad request`,

  // User
  USER_REGISTER: `User registered successfully`,
  USER_LOGIN: `User logged in successfully`,
  USER_EXISTS: `User already exists`,
  USER_ALREADY_VERIFIED: `User Already verified`,
  USER_NOT_VERIFIED: `User not verified`,
  USER_NOT_FOUND: `User not found`,
  ACCOUNT_DEACTIVATED: `Account has been temporarily deactivated`,
  ACCOUNT_VERIFIED: `User account verified successfully.`,
  USER_FETCHED: `User fetched successfully`,
  USERS_FETCHED: `Users fetched successfully`,
  USER_DELETED: `User deleted successfully`,
  USER_UPDATED: `User updated successfully`,
  USER_ADDED: `User added successfully`,
  USER_INACTIVE: `User account is temporarily inactive`,

  // Authentication
  INVALID_CREDENTIALS: `Invalid Credentials`,
  LOGIN_SUCCESS: `Login successful`,
  LOGOUT_SUCCESS: `Logout successful`,
  UNAUTHORIZED: `Unauthorized access`,
  FORBIDDEN: `Access forbidden`,
  TOKEN_EXPIRED: `Token has expired`,
  TOKEN_INVALID: `Invalid token`,
  PASSWORD_CHANGED: `Password changed successfully`,
  PASSWORD_INCORRECT: `Incorrect password`,
  PASSWORD_OLD_INCORRECT: `Incorrect old password`,
  ENTERED_OLD_PASSWORD: `You have entered your old password. Please enter a new password`,

  // Data
  DATA_FETCHED: `Data fetched successfully`,
  DATA_GENERATED: `Data generated successfully`,
  DATA_NOT_FOUND: `No data found`,
  DATA_UPDATED: `Data updated successfully`,
  DATA_DELETED: `Data deleted successfully`,
  DATA_ADDED: `Data added successfully`,
  DATA_REQUIRED: `Data is required`,
  DATA_ALREADY_EXISTS: `Data  already exists`,
  DATA_IS_CLOSED: `Data is closed`,

  // Id
  ID_REQUIRED: `Id is required`,

  // file
  PDF_REQUIRED: `PDF file is required`,
  CSV_REQUIRED: `CSV file is required`,
  EXCEL_REQUIRED: `Excel file is required`,
  IMAGE_REQUIRED: `Image file is required`,
  FILE_REQUIRED: `File is required`,

  // Profile
  USERNAME_EXISTS: `Username already exists`,

  // OTP
  OTP_SENT: `The OTP has been successfully sent to your phone number. Please check your inbox.`,
  OTP_VERIFIED: `OTP verified successfully`,
  OTP_NOT_VERIFIED: `OTP not verified. Please verify OTP.`,
  OTP_EXPIRED: `OTP has expired`,
  OTP_INVALID: `Invalid or expired OTP`,
  OTP_RESENT: `OTP resent successfully`,
  OTP_LIMIT_EXCEEDED: `OTP request limit exceeded, please try again later`,
  OTP_NOT_FOUND: `OTP not found. Please request a new OTP.`,

  // Address
  ADDRESS_CREATED: 'Address created successfully',
  ADDRESS_FETCHED: 'Addresses fetched successfully',
  ADDRESS_UPDATED: 'Address updated successfully',
  ADDRESS_DELETED: 'Address deleted successfully',
  ADDRESS_NOT_FOUND: 'Address not found',

  // Faq
  FAQ_CREATED: 'FAQ created successfully',
  FAQ_FETCHED: 'FAQs fetched successfully',
  FAQ_UPDATED: 'FAQ updated successfully',
  FAQ_DELETED: 'FAQ deleted successfully',
  FAQ_NOT_FOUND: 'FAQ not found',

  // Support
  SUPPORT_CREATED: 'Support request submitted successfully',
  SUPPORT_FETCHED: 'Support requests fetched successfully',
  SUPPORT_UPDATED: 'Support request updated successfully',
  SUPPORT_NOT_FOUND: 'Support request not found',

  // Driver
  DRIVER_UPDATED: 'Driver details updated successfully',
  DRIVER_FETCHED: 'Driver details fetched successfully',
  DRIVER_STATUS_UPDATED: 'Driver status updated successfully',
  DRIVER_NOT_ONLINE: 'Driver is not online',
  DRIVER_NOT_AVAILABLE: 'Driver is not available',
  DRIVER_NOT_FOUND: 'Driver not found',
  DRIVER_NOT_ASSIGNED: 'Driver not assigned',
  DRIVERS_FETCHED: 'Drivers fetched successfully',

  // Ride type
  RIDE_TYPE_CREATED: 'Ride type created successfully',
  RIDE_TYPE_FETCHED: 'Ride types fetched successfully',
  RIDE_TYPE_UPDATED: 'Ride type updated successfully',
  RIDE_TYPE_DELETED: 'Ride type deleted successfully',
  RIDE_TYPE_NOT_FOUND: 'Ride type not found',

  // Route
  ROUTE_NOT_FOUND: 'Route not found',
  ROUTE_CREATED: 'Route created successfully',
  ROUTE_UPDATED: 'Route updated successfully',
  ROUTE_DELETED: 'Route deleted successfully',

  // Fare
  FARE_ESTIMATED: 'Fare estimated successfully',
  FARE_NOT_FOUND: 'Fare not found',

  // Location
  LOCATION_UPDATED: 'Location updated successfully',
  LOCATION_FETCHED: 'Location fetched successfully',
  LOCATION_NOT_FOUND: 'Location not found',
  LOCATION_DELETED: 'Location deleted successfully',
  LOCATION_CREATED: 'Location created successfully',

  // Ride
  RIDE_BOOKED: 'Ride booked successfully',
  RIDE_FETCHED: 'Ride fetched successfully',
  RIDES_FETCHED: 'Rides fetched successfully',
  RIDES_NOT_FOUND: 'No Rides Found',
  RIDE_NOT_COMPLETED: 'Ride not completed',
  RIDE_UPDATED: 'Ride updated successfully',
  RIDE_DELETED: 'Ride deleted successfully',
  RIDE_ALREADY_ACCEPTED: 'Ride already accepted',
  RIDE_ACCEPTED: 'Ride accepted successfully',
  RIDE_CANCELLED: 'Ride cancelled successfully',
  RIDE_ALREADY_CANCELLED: 'Ride already cancelled',
  RIDE_ALREADY_COMPLETED: 'Ride already completed',
  RIDE_NOT_FOUND: 'Ride not found',
  ACTIVE_RIDE_EXISTS: 'You already have an active ride',
  NO_ACTIVE_RIDES_FOUND: 'No active rides found',
  NO_RIDES_FOUND_NEARBY: 'No rides found nearby',
  RIDE_STATUS_UPDATED_SUCCESSFULLY: 'Ride status updated successfully.',
  RIDE_NOT_ASSIGNED_TO_DRIVER: 'Ride is not assigned to this driver.',
  DRIVER_CAN_ONLY_ARRIVE_AFTER_ACCEPTING_THE_RIDE:
    'Driver can only arrive after accepting the ride.',
  RIDE_CAN_ONLY_START_AFTER_DRIVER_ARRIVES:
    'Ride can only start after driver arrives.',
  RIDE_MUST_BE_ONGOING_BEFORE_REQUESTING_PAYMENT:
    'Ride must be ongoing before requesting payment.',
  RIDE_COMPLETION_HANDLED_AFTER_SUCCESSFUL_PAYMENT:
    'Ride completion is handled after successful payment.',
  INVALID_RIDE_STATUS: 'Invalid ride status.',

  // Chat
  CHAT_JOINED: 'Chat joined successfully',
  CHAT_NOT_FOUND: 'Chat not found',
  CHAT_NOT_AUTHORIZED: 'You are not authorized to join this chat',
  CHAT_ALREADY_JOINED: 'You are already a member of this chat',
  CHAT_IS_NOT_AVAILABLE: 'Chat is not available for this ride.',
  CHAT_FETCHED: 'Chat fetched successfully',

  //Message
  MESSAGE_SENT: 'Message sent successfully',
  MESSAGE_NOT_SENT: 'Message not sent',
  MESSAGE_FETCHED: 'Message fetched successfully',
  MESSAGE_NOT_FOUND: 'Message not found',

  //Rating
  RATING_SUBMITTED: 'Rating submitted successfully',
  RATING_NOT_SUBMITTED: 'Rating not submitted',
  RATING_ALREADY_SUBMITTED: 'Rating already submitted',
  RATING_FETCHED: 'Rating fetched successfully',
  RATING_NOT_FOUND: 'Rating not found',
  REVIEWS_FETCHED: 'Reviews fetched successfully',

  //Counter fare
  FARE_COUNTER_SENT: 'Fare counter sent successfully',
  FARE_COUNTER_RECEIVED: 'Fare counter received successfully',
  COUNTER_FARE_REJECTED: `Counter fare rejected successfully`,
  FARE_COUNTER_NOT_FOUND: 'Fare counter not found',
  WAIT_FOR_DRIVER_RESPONSE: 'Wait for driver response',
  WAIT_FOR_USER_RESPONSE: 'Wait for user response',
  NEGOTIATION_LIMIT_REACHED: 'Negotiation limit reached',

  // SuperAdmin
  DRIVER_VERIFIED: 'Driver verified successfully',
  DRIVER_REJECTED: 'Driver rejected successfully',

  // Company
  COMPANY_REGISTERED: 'Company registered successfully',
  COMPANY_EXISTS: 'Company with this email already exists',
  COMPANY_NOT_FOUND: 'Company not found',
  COMPANY_PROFILE_FETCHED: 'Company profile fetched successfully',
  COMPANY_CARS_FETCHED: 'Company cars fetched successfully',
  NO_CARS_FOUND: 'No cars found for this company',
  CAR_NOT_FOUND: 'Car not found',
};
