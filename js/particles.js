document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('galaxy-particles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    const particleCount = 150; // Increased number of particles for a more continuous effect
    const maxParticleSize = 2;
    const minParticleSize = 0.5;
    const particleSpeed = 0.1; // Decreased speed for slower normal particles
    const horizontalDrift = 0.1; // Adjusted horizontal drift
    const shootingStarChance = 0.01; // Increased chance for a particle to be a shooting star for more frequent events
    const shootingStarSpeedMultiplier = 8; // Increased speed for shooting stars
    const trailLength = 10; // Number of segments in the trail

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
        constructor(isShootingStar = false) {
            this.isShootingStar = isShootingStar;
            this.init();
        }

        init() {
            this.size = Math.random() * (maxParticleSize - minParticleSize) + minParticleSize;
            this.speed = Math.random() * particleSpeed + 0.1;
            this.opacity = Math.random() * 0.8 + 0.2; // Subtle opacity
            this.trail = []; // Store previous positions for the trail
            this.angle = Math.random() * Math.PI * 2; // Initial direction for shooting stars

            if (this.isShootingStar) {
                this.speed *= shootingStarSpeedMultiplier;
                this.opacity = 1; // Shooting stars are brighter
                this.size *= 1.5; // Shooting stars are a bit larger
                // Start shooting stars from the top of the site
                this.x = Math.random() * canvas.width; // Start anywhere across the top width
                this.y = -this.size; // Start just above the top edge
                this.angle = Math.random() < 0.5 ? Math.PI / 4 : (3 * Math.PI) / 4; // Diagonal movement (down-right or down-left)
            } else {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height; // Normal particles start anywhere initially
            }
        }

        resetPosition() { // This method only resets position and trail
            this.trail = [];
            if (this.isShootingStar) {
                this.x = Math.random() * canvas.width;
                this.y = -this.size;
                this.angle = Math.random() < 0.5 ? Math.PI / 4 : (3 * Math.PI) / 4;
            } else {
                this.x = Math.random() * canvas.width;
                this.y = -this.size; // Normal particles also start from top when they go out of bounds
            }
        }

        draw() {
            // Draw the trail for shooting stars
            if (this.isShootingStar) {
                for (let i = 0; i < this.trail.length; i++) {
                    const trailPart = this.trail[i];
                    const opacity = this.opacity * (i / this.trail.length); // Fade out trail
                    ctx.beginPath();
                    ctx.arc(trailPart.x, trailPart.y, trailPart.size, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.fill();
                }
            }

            // Draw the main particle
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            ctx.fill();
        }

        update() {
            if (this.isShootingStar) {
                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed;

                // Add current position to trail
                this.trail.push({ x: this.x, y: this.y, size: this.size * 0.5 });
                if (this.trail.length > trailLength) {
                    this.trail.shift(); // Remove oldest trail part
                }

                // Reset if out of bounds
                if (this.x < -this.size || this.x > canvas.width + this.size || this.y > canvas.height + this.size) {
                    this.resetPosition();
                }
            } else {
                this.y += this.speed;
                this.x += (Math.random() - 0.5) * horizontalDrift; // Add slight horizontal movement
                if (this.y > canvas.height) {
                    this.resetPosition();
                }
                // Keep particles within horizontal bounds
                if (this.x < 0) this.x = canvas.width;
                if (this.x > canvas.width) this.x = 0;
            }
        }
    }

    function createParticles() {
        for (let i = 0; i < particleCount; i++) {
            const isShootingStar = Math.random() < shootingStarChance;
            particles.push(new Particle(isShootingStar));
        }
    }

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
        }
        requestAnimationFrame(animateParticles);
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    createParticles();
    animateParticles();
});
