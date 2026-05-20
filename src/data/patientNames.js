'use strict';

// Patient name pool — demographically varied, realistic EMS patient names.
// Separated by sex so names match the rolled patient sex.
// Enough entries to make back-to-back repeats rare without history tracking.

const FIRST_NAMES_MALE = [
  'James', 'Robert', 'William', 'David', 'Richard', 'Joseph', 'Thomas',
  'Charles', 'Gary', 'Donald', 'Kenneth', 'Steven', 'Edward', 'Brian',
  'Ronald', 'Anthony', 'Kevin', 'Jason', 'Matthew', 'Mark', 'Timothy',
  'Jeffrey', 'Raymond', 'Gregory', 'Joshua', 'Jerry', 'Dennis', 'Walter',
  'Patrick', 'Peter', 'Harold', 'Douglas', 'Henry', 'Carl', 'Arthur',
  'Ryan', 'Roger', 'Joe', 'Juan', 'Jack', 'Albert', 'Jonathan', 'Justin',
  'Terry', 'Gerald', 'Keith', 'Samuel', 'Willie', 'Ralph', 'Lawrence',
  'Nicholas', 'Roy', 'Benjamin', 'Bruce', 'Brandon', 'Adam', 'Harry',
  'Fred', 'Wayne', 'Billy', 'Steve', 'Louis', 'Jeremy', 'Aaron', 'Randy',
  'Howard', 'Eugene', 'Carlos', 'Russell', 'Bobby', 'Victor', 'Martin',
  'Ernest', 'Phillip', 'Todd', 'Jesse', 'Craig', 'Alan', 'Shawn', 'Clarence',
  'Sean', 'Philip', 'Chris', 'Johnny', 'Earl', 'Jimmy', 'Antonio', 'Danny',
  'Bryan', 'Tony', 'Luis', 'Mike', 'Stanley', 'Leonard', 'Nathan', 'Dale',
  'Manuel', 'Rodney', 'Curtis', 'Norman', 'Marvin', 'Vincent', 'Glenn',
  'Jeffery', 'Travis', 'Jeff', 'Chad', 'Jacob', 'Melvin',
];

const FIRST_NAMES_FEMALE = [
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan',
  'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra',
  'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Carol',
  'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura',
  'Cynthia', 'Kathleen', 'Amy', 'Angela', 'Shirley', 'Anna', 'Brenda',
  'Pamela', 'Emma', 'Nicole', 'Helen', 'Samantha', 'Katherine', 'Christine',
  'Debra', 'Rachel', 'Carolyn', 'Janet', 'Catherine', 'Maria', 'Heather',
  'Diane', 'Julie', 'Joyce', 'Victoria', 'Ruth', 'Virginia', 'Lauren',
  'Kelly', 'Christina', 'Joan', 'Evelyn', 'Judith', 'Olivia', 'Cheryl',
  'Megan', 'Martha', 'Andrea', 'Frances', 'Hannah', 'Jacqueline', 'Ann',
  'Gloria', 'Jean', 'Kathryn', 'Alice', 'Teresa', 'Sara', 'Janice',
  'Doris', 'Madison', 'Julia', 'Grace', 'Judy', 'Abigail', 'Marie', 'Denise',
  'Beverly', 'Amber', 'Theresa', 'Marilyn', 'Danielle', 'Diana', 'Brittany',
  'Natalie', 'Sophia', 'Rose', 'Isabella', 'Alexis', 'Kayla', 'Charlotte',
  'Tiffany', 'Vanessa', 'Norma', 'Tammy', 'Irene', 'Connie', 'April',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
  'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Turner', 'Phillips', 'Evans', 'Collins', 'Edwards',
  'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Peterson',
  'Cooper', 'Reed', 'Bailey', 'Bell', 'Gomez', 'Kelly', 'Howard', 'Ward',
  'Cox', 'Diaz', 'Richardson', 'Wood', 'Watson', 'Brooks', 'Bennett',
  'Gray', 'James', 'Reyes', 'Cruz', 'Hughes', 'Price', 'Myers', 'Long',
  'Foster', 'Sanders', 'Ross', 'Morales', 'Powell', 'Sullivan', 'Russell',
  'Ortiz', 'Jenkins', 'Gutierrez', 'Perry', 'Butler', 'Barnes', 'Fisher',
  'Henderson', 'Coleman', 'Simmons', 'Patterson', 'Jordan', 'Reynolds',
  'Hamilton', 'Graham', 'Kim', 'Gonzales', 'Alexander', 'Ramos', 'Wallace',
  'Griffin', 'West', 'Cole', 'Hayes', 'Bryant', 'Herrera', 'Gibson',
  'Ellis', 'Tran', 'Medina', 'Aguilar', 'Stevens', 'Murray', 'Ford',
  'Castro', 'Marshall', 'Owens', 'Harrison', 'Fernandez', 'Mcdonald',
  'Woods', 'Washington', 'Kennedy', 'Wells', 'Vargas', 'Henry', 'Chen',
  'Freeman', 'Webb', 'Tucker', 'Guzman', 'Burns', 'Crawford', 'Olson',
  'Simpson', 'Porter', 'Hunter', 'Gordon', 'Mendoza', 'Silva', 'Shaw',
  'Snyder', 'Warren', 'Dixon', 'Ramos', 'Ray', 'Hicks', 'Hawkins',
];

/**
 * Pick a patient name matching the rolled sex.
 * Returns a full name string: "FirstName LastName"
 */
function rollPatientName(sex) {
  const firstPool = sex === 'female' ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
  const first = firstPool[Math.floor(Math.random() * firstPool.length)];
  const last  = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

module.exports = { rollPatientName };
