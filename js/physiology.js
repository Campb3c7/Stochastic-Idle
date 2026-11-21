// Human body model. Mass is tracked in compartments (kg):
//   fat, protein, glycogen, water, minerals   ->   weight = sum
// Energy spent is paid for from glycogen first, then a fat/protein mix whose
// protein share follows Forbes/Hall (leaner people burn more protein), and
// falls as the body adapts to fasting (ketosis). Losing glycogen or protein
// also frees the water bound to it, which is why early weight loss is fast.
(function () {
  "use strict";

  // Energy cost of each activity, as a multiple of basal metabolic rate.
  const ACTIVITY_COST = { sleep: 0.95, idle: 1.3, walk: 3.3, wade: 4.6, drink: 1.3 };

  const KCAL_PER_KG = { glycogen: 4100, protein: 4000, fat: 9400 };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  class Body {
    constructor(o) {
      this.age = o.age;
      this.heightCm = o.heightCm;
      this.metabolismMult = o.metabolismMult;

      const W = o.weight;
      this.fat = W * o.bodyFat;
      const ffm = W - this.fat;
      this.water = 0.73 * ffm;                  // fat-free mass is ~73% water
      this.glycogenMax = o.glycogenMax;
      this.glycogen = o.glycogenMax * o.glycogenStart;
      this.minerals = 0.055 * ffm;              // bone mineral etc.
      this.protein = ffm - this.water - this.glycogen - this.minerals;
      // Water normally held per kg of dry lean tissue (glycogen holds 3 g/g).
      this.kWater = (this.water - 3 * this.glycogen) / (this.protein + this.minerals);

      this.start = { weight: W, fat: this.fat, protein: this.protein };
      this.keto = 0;               // 0..1 adaptation to fasting
      this.sleepPressure = 0.2;    // 0 rested .. 1 exhausted
      this.kcalToday = 0;
      this.kcalYesterday = null;
      this.kcalTotal = 0;
      this.eatenToday = 0;
      this.drankToday = 0;
      this.kcalPerHour = 0;
      this.coldPerHour = 0;
      this.mix = { glyc: 0, fat: 0, prot: 0 };
    }

    get weight() { return this.fat + this.protein + this.glycogen + this.water + this.minerals; }
    get leanMass() { return this.weight - this.fat; }
    get bodyFatPct() { return (this.fat / this.weight) * 100; }
    get muscle() { return this.protein * 2.6; } // rough skeletal-muscle estimate
    get glycogenFrac() { return this.glycogen / this.glycogenMax; }
    get expectedWater() { return this.kWater * (this.protein + this.minerals) + 3 * this.glycogen; }
    get waterDeficit() { return this.expectedWater - this.water; }
    get dehydrationPct() { return (Math.max(0, this.waterDeficit) / this.expectedWater) * 100; }
    // Katch-McArdle BMR, scaled by individual metabolism and fasting adaptation.
    get bmr() { return (370 + 21.6 * this.leanMass) * this.metabolismMult * (1 - 0.12 * this.keto); }

    get hunger() { return clamp01(0.1 + 0.9 * (1 - this.glycogenFrac)) * (1 - 0.4 * this.keto); }
    get thirst() { return clamp01((this.dehydrationPct - 0.3) / 2.7); }
    get fatigue() { return this.sleepPressure; }

    drink(litres) { this.water += litres; this.drankToday += litres; }

    // dt in game seconds. env: { temp (deg C) }
    update(dt, activity, env) {
      const h = dt / 3600;

      // --- Energy out ---
      const neutral = activity === "sleep" ? 20 : 15; // below this, shivering/heat production costs extra
      const cold = env.temp < neutral ? (neutral - env.temp) * (activity === "sleep" ? 4 : 2.5) : 0;
      const kcalH = (this.bmr / 24) * (ACTIVITY_COST[activity] || 1.3) + cold;
      const kcal = kcalH * h;
      this.kcalPerHour = kcalH;
      this.coldPerHour = cold;

      // --- Which fuel pays for it ---
      let fromG = kcal * 0.55 * Math.pow(this.glycogenFrac, 0.7);
      fromG = Math.min(fromG, this.glycogen * KCAL_PER_KG.glycogen);
      const rest = kcal - fromG;
      const leanShare = 10.4 / (10.4 + this.fat);                  // Forbes' rule
      let pE = leanShare / (leanShare + (1 - leanShare) * 9.4);     // energy share from lean tissue
      pE *= 1 - 0.5 * this.keto;
      const fromP = rest * pE, fromF = rest - fromP;
      this.glycogen -= fromG / KCAL_PER_KG.glycogen;
      this.protein -= fromP / KCAL_PER_KG.protein;
      this.fat -= fromF / KCAL_PER_KG.fat;
      if (kcal > 0) this.mix = { glyc: fromG / kcal, fat: fromF / kcal, prot: fromP / kcal };

      // --- Water balance (litres ~ kg) ---
      const T = env.temp;
      let loss = 0.035 + (T > 20 ? (T - 20) * 0.004 : 0);           // breath + skin
      if (activity === "walk" || activity === "wade") loss += 0.03 + Math.max(0, T - 12) * 0.012; // sweat
      const deficit = this.waterDeficit;
      const urine = (deficit > 0.5 ? 0.015 : 0.03) + Math.max(0, -deficit) * 0.6; // kidneys clear excess
      const metabolicWater = kcal * 0.00012;
      this.water += -(loss + urine) * h + metabolicWater;

      // --- Fasting adaptation (days) ---
      const target = this.glycogenFrac < 0.25 ? 1 : 0;
      this.keto += (target - this.keto) * Math.min(1, h / 48);

      // --- Sleep pressure ---
      if (activity === "sleep") this.sleepPressure = Math.max(0, this.sleepPressure - h * 0.115);
      else this.sleepPressure = Math.min(1, this.sleepPressure + h * (activity === "walk" || activity === "wade" ? 0.07 : 0.055));

      this.kcalToday += kcal;
      this.kcalTotal += kcal;
    }

    newDay() {
      this.kcalYesterday = this.kcalToday;
      this.kcalToday = 0;
      this.eatenToday = 0;
      this.drankToday = 0;
    }
  }

  window.SI = window.SI || {};
  SI.Body = Body;
})();
