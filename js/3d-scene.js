// Game Developer Themed Hero Background - Lightweight & Performant
(function() {
    const canvas = document.getElementById('canvas3d');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    let gameElements = [];
    
    // Resize canvas
    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    
    // Pixel Particle class
    class Particle {
        constructor() {
            this.reset();
            this.y = Math.random() * height;
            this.opacity = Math.random();
        }
        
        reset() {
            this.x = Math.random() * width;
            this.y = -10;
            this.size = Math.random() * 3 + 1;
            this.speedY = Math.random() * 0.5 + 0.2;
            this.speedX = Math.random() * 0.3 - 0.15;
            this.opacity = Math.random() * 0.5 + 0.3;
            
            // Game themed colors
            const colors = [
                '#FF6B35', // Orange
                '#FF8585', // Pink
                '#FFD93D', // Yellow
                '#9B59B6', // Purple
                '#4ECDC4'  // Cyan
            ];
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
        
        update() {
            this.y += this.speedY;
            this.x += this.speedX;
            
            if (this.y > height + 10) {
                this.reset();
            }
            
            if (this.x < -10 || this.x > width + 10) {
                this.x = Math.random() * width;
            }
        }
        
        draw() {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            
            // Draw pixel
            ctx.fillRect(
                Math.floor(this.x), 
                Math.floor(this.y), 
                this.size, 
                this.size
            );
        }
    }
    
    // Game Element class (controllers, hearts, stars, etc.)
    class GameElement {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = Math.random() * 40 + 30;
            this.speedY = Math.random() * 0.3 + 0.1;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.02;
            this.opacity = Math.random() * 0.15 + 0.05;
            
            // Different game icons
            this.type = Math.floor(Math.random() * 5);
        }
        
        update() {
            this.y += this.speedY;
            this.rotation += this.rotationSpeed;
            
            if (this.y > height + this.size) {
                this.y = -this.size;
                this.x = Math.random() * width;
            }
        }
        
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.globalAlpha = this.opacity;
            ctx.strokeStyle = '#FF6B35';
            ctx.lineWidth = 2;
            
            switch(this.type) {
                case 0: // Game Controller
                    this.drawController();
                    break;
                case 1: // Heart (Health)
                    this.drawHeart();
                    break;
                case 2: // Star (Points)
                    this.drawStar();
                    break;
                case 3: // Trophy
                    this.drawTrophy();
                    break;
                case 4: // Pixel Sword
                    this.drawSword();
                    break;
            }
            
            ctx.restore();
        }
        
        drawController() {
            const s = this.size / 2;
            ctx.beginPath();
            ctx.roundRect(-s, -s/2, s*2, s, s/4);
            ctx.stroke();
            
            // D-pad
            ctx.fillStyle = '#FF6B35';
            ctx.fillRect(-s*0.6, -s*0.15, s*0.3, s*0.3);
            
            // Buttons
            ctx.beginPath();
            ctx.arc(s*0.4, -s*0.1, s*0.15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(s*0.6, s*0.1, s*0.15, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        drawHeart() {
            const s = this.size / 2;
            ctx.beginPath();
            ctx.moveTo(0, s*0.3);
            ctx.bezierCurveTo(-s, -s*0.3, -s*0.5, -s, 0, -s*0.3);
            ctx.bezierCurveTo(s*0.5, -s, s, -s*0.3, 0, s*0.3);
            ctx.stroke();
        }
        
        drawStar() {
            const s = this.size / 2;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                const x = Math.cos(angle) * s;
                const y = Math.sin(angle) * s;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }
        
        drawTrophy() {
            const s = this.size / 2;
            ctx.beginPath();
            ctx.moveTo(-s*0.4, -s*0.6);
            ctx.lineTo(-s*0.4, s*0.2);
            ctx.lineTo(-s*0.7, s*0.4);
            ctx.lineTo(s*0.7, s*0.4);
            ctx.lineTo(s*0.4, s*0.2);
            ctx.lineTo(s*0.4, -s*0.6);
            ctx.closePath();
            ctx.stroke();
            
            // Cup handles
            ctx.beginPath();
            ctx.arc(-s*0.4, -s*0.2, s*0.2, Math.PI/2, -Math.PI/2, true);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(s*0.4, -s*0.2, s*0.2, Math.PI/2, -Math.PI/2);
            ctx.stroke();
        }
        
        drawSword() {
            const s = this.size / 2;
            // Blade
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s*0.1, s*0.3);
            ctx.lineTo(-s*0.1, s*0.3);
            ctx.closePath();
            ctx.stroke();
            
            // Handle
            ctx.strokeRect(-s*0.3, s*0.3, s*0.6, s*0.3);
            
            // Guard
            ctx.beginPath();
            ctx.moveTo(-s*0.4, s*0.3);
            ctx.lineTo(s*0.4, s*0.3);
            ctx.stroke();
        }
    }
    
    // Initialize
    function init() {
        resize();
        
        // Create pixel particles
        for (let i = 0; i < 100; i++) {
            particles.push(new Particle());
        }
        
        // Create game elements
        for (let i = 0; i < 8; i++) {
            gameElements.push(new GameElement());
        }
        
        animate();
    }
    
    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        // Update and draw particles
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
        
        // Update and draw game elements
        gameElements.forEach(element => {
            element.update();
            element.draw();
        });
        
        ctx.globalAlpha = 1;
        requestAnimationFrame(animate);
    }
    
    // Event listeners
    window.addEventListener('resize', resize);
    
    // Mouse interaction
    let mouseX = 0, mouseY = 0;
    canvas.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        // Add particles on mouse move
        if (Math.random() > 0.8) {
            const p = new Particle();
            p.x = mouseX;
            p.y = mouseY;
            p.speedY = (Math.random() - 0.5) * 2;
            p.speedX = (Math.random() - 0.5) * 2;
            particles.push(p);
            
            // Remove old particles to maintain performance
            if (particles.length > 150) {
                particles.shift();
            }
        }
    });
    
    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();