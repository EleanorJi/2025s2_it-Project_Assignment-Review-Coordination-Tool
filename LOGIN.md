## Login and invitation test steps:

1. Create a database locally.
   - Make sure you have installed the PostgreSQL database. If not, you can download and install it from [the PostgreSQL website](https://www.postgresql.org/download/).
   - Open the database pgAdmin4 (if it cannot be found, you can search for pgAdmin4 on the start interface)
   - Log in to your PostgreSQL server (usually localhost, port 5432, username postgres, and password is the one you set during installation).
   - Create a new database named `assignment_mod`:
     - Right-click on "Databases" in the left sidebar and select "Create" > "Database...".
     - Enter `assignment_mod` as the database name and click "Save".
   - Set up an initial user (for example, username `admin`, password `password`), and ensure that this user has all permissions for the `assignment_mod` database.
   - To insert an initial "admin" database table, you can use the following SQL command:
     ```sql
     INSERT INTO app_user (name, email, password_hash, role, is_active)
     VALUES (
      'admin',
      'admin@grading.com',
      'admin123',
      'COORDINATOR',
      true
     );
     ```
   - Make sure that the database connection configuration in backend/src/config/database.js matches your database settings (such as the username, password - it should be the password you set during installation, the host and the port).
2. Start the backend server:
   - Make sure that you have installed all the dependencies (`npm install`, `node.js`, `express`, etc.).
   - Open the terminal at the current project location
   - Run `node backend/src/app.js` to start the backend server.
3. Test login:
   1. Open the browser and visit `http://localhost:3000/login.html`
      
      You should see the login page:
      ![img.png](test_image_readme/img.png)
   2. Input the email/username and password to log in.

      If you are using the above SQL, then enter:
         - Email/Username: admin@grading.com/admin
         - Password: admin123
      
      Then can see "Login successful!"：
      ![img_1.png](test_image_readme/img_1.png)

4. Test invitation:

   Postman Usage Declaration: We use Postman because we haven't completed the transition of the login-dashboard-invitation interface yet. Once it's completed later, we won't need Postman.
   
   1. Download Postman from [the Postman website](https://www.postman.com/downloads/) and install it.
   2. Open Postman and enter "POST" http://localhost:3000/api/invitations
   3. add headers
        ```
        Content-Type: application/json
        x-user-id: 1
        ```
        ![img_2.png](test_image_readme/img_2.png)
   4. add body -> raw -> JSON
      ```json
      {
       "email": "marker1@example.com"
      }
       ```
   5. Click "Send"
   
      You should see the response like this:
      ```json
      {
       "success": true,
       "message": "Invitation sent successfully"
       }
   6. In the terminal, copy the token: XXX
   7. Open the browser and visit http://localhost:3000/signup.html?token=XXX
      
      will see the signup page:
      ![img_3.png](test_image_readme/img_3.png)
      Enter your username and password, check the terms of agreement, and click "Sign Up".
   8. After successful registration, you will see:
      ![img_4.png](test_image_readme/img_4.png)
      Click "Sign in" to navigate to the login page.
   9. It will return to the previous login interface.
      ![img_5.png](test_image_readme/img_5.png)
   10. Input the email/username and password to log in.
   11. Clicking on "Sign In" will result in "Login successful!":
      ![img_6.png](test_image_readme/img_6.png)
