from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from routes.resume_routes import resume_bp
from routes.auth_routes import auth_bp

# ✅ 1. Create Flask app FIRST
app = Flask(__name__)
CORS(app)

# ✅ 2. JWT config AFTER app creation
app.config["JWT_SECRET_KEY"] = "secret"
jwt = JWTManager(app)

# ✅ 3. Register blueprints
app.register_blueprint(resume_bp)
app.register_blueprint(auth_bp)

# ✅ 4. Run app
if __name__ == "__main__":
    app.run(debug=True)
