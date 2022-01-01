//  ---------------- Function definitions ------------------

function saveData(name, data) {
    localStorage.setItem(name, JSON.stringify(data));
}

function loadData(name) {
    data = JSON.parse(localStorage.getItem(name));
    return data
}

// Bag is a list of lists, each interior list is one token as 
// [value as number, redraw as boolean, name as string, autofail after as string]
function makeBag(tokens) {
    var bag = []
    for (const [token_name, token] of Object.entries(tokens)) {
        for (let i = 1; i <= token[0]; i++) {
            bag.push([token[1], token[2], token_name, token[3]])
        }
    };
    return bag
}

function prepareModifiers(abilitiesActive, abilityEffects, modifiers) {
    for (const [k, v] of Object.entries(modifiers)) {
        modifiers[k] = [];
    };
    if (abilitiesActive.length != 0) {
        abilitiesActive.forEach(function(ability, i) {
            var abilityEffect = abilityEffects[ability];
            for (const [k, v] of Object.entries(abilityEffect)) {
                if (modifiers[k].length == 0 || abilityEffect[k][0] == 's') {
                    modifiers[k] = v
                } else if (modifiers[k][0] == 'a') {
                    modifiers[k][1] += abilityEffect[k][1]
                }
            };
        })
    }
}

// Functions
function range(start, end) {
    if (start === end) return [start];
    return [start, ...range(start + 1, end)];
}

function calculateTotal(previousTotal, token, modifiers) {
    var total = previousTotal + token[0];
    if (modifiers[token[2]].length != 0) {
        if (modifiers[token[2]][0] == 'a') {
            total += modifiers[token[2]][1]
        } else {
            total = modifiers[token[2]][1]
        }
    }
    return total
}

function calculationStep(remainingOptions, previousTotal, probMod, lastDraw, drawCount, autofail_value, redraw_max, allResults, modifiers) {
    remainingOptions.forEach(function(token, i) {
        // Calculate result, assuming now additional stuff happening
        console.log('last: ', lastDraw, 'current: ', token[2], 'autofail after: ', token[3])
        if (lastDraw && lastDraw == token[3]) { // If the previous draw would make this an autofail, do that
            console.log('autofailed on ', lastDraw, token[2], token[3])
            allResults.push([autofail_value, probMod]);
        } else if (token[1] && modifiers[token[2]][2] != 'noRedraw') { // If this is a token that prompts a redraw, do that
            if (drawCount + 1 > redraw_max) { // If this draw is too many redraws - treat as an autofail to speed up calculation
                allResults.push([autofail_value, probMod]);
            } else {
                var total = calculateTotal(previousTotal, token, modifiers)
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token[2], drawCount + 1, autofail_value, redraw_max, allResults, modifiers)
            }
        } else if (token[0] == autofail_value) { // Special case so autofail always has same value
            allResults.push([autofail_value, probMod]);
        } else { // No redraw - just spit out the current total and probability
            var total = calculateTotal(previousTotal, token, modifiers)
            allResults.push([total, probMod]);
        }
    });
}

function aggregate(results) {
    var prob = new Object();
    r = range(-25, 21).concat([-999])
    r.forEach(function(value, i) {
        //prob[i] = sum([p for v, p in results if v == i])* 100
        const filteredResults = results.filter(function(array) {
            return array.includes(value)
        })
        if (filteredResults.length != 0) {
            //console.log(filteredResults[0], filteredResults[0][1], typeof (filteredResults[0][1]))
            const probSumFunction = (sum, curr) => sum + curr[1];
            prob[value] = filteredResults.reduce(probSumFunction, 0) * 100;
            //console.log(prob)
        }
    })

    var probCumul = new Object();
    probCumul[-2] = sumStuffUp(prob, 1);
    probCumul[-1] = sumStuffUp(prob, 0);
    probCumul[0] = sumStuffUp(prob, -1);
    probCumul[1] = sumStuffUp(prob, -2);
    probCumul[2] = sumStuffUp(prob, -3);
    probCumul[3] = sumStuffUp(prob, -4);
    probCumul[4] = sumStuffUp(prob, -5);
    probCumul[5] = sumStuffUp(prob, -6);
    probCumul[6] = sumStuffDown(prob, -6);

    return probCumul
}

function sumStuffUp(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k > target) {
            temp += v;
        }
    }
    return temp;
}

function sumStuffDown(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k <= target) {
            temp += v;
        }
    }
    return temp;
}

// Test it out

function run(tokens, abilitiesActive, abilityEffects, modifiers, redraw_max) {
    var allResults = []
    bag = makeBag(tokens)
    console.log("abilityEffects in run(): ", abilityEffects)
    prepareModifiers(abilitiesActive, abilityEffects, modifiers)
    calculationStep(bag, 0, 1 / bag.length, null, 1, tokens['autofail'][1], redraw_max, allResults, modifiers)
    cumulative = aggregate(allResults)
    saveData(saveName, data)

    return cumulative
}

function probabilityPlot(p) {
    xValue = range(-2, 5);
    yValue = [
        Math.round(p[-2]),
        Math.round(p[-1]),
        Math.round(p[0]),
        Math.round(p[1]),
        Math.round(p[2]),
        Math.round(p[3]),
        Math.round(p[4]),
        Math.round(p[5])
    ];
    var data = [{
        x: xValue,
        y: yValue,
        type: 'bar',
        text: yValue.map(String),
        textposition: 'auto',
        textfont: {
            size: 18
        }
    }];
    var layout = {
        title: "Chance of success",
        xaxis: {
            title: {
                text: 'Skill Value vs. Test Difficulty',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            }
        },
        yaxis: {
            title: {
                text: 'Probability of Success',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            },
            range: [0, 101]
        }
    }

    return Plotly.newPlot('probPlot', data, layout);
}


//  ---------------- Set up the page and params ------------------

// Params
var saveName = "mgArkhamChaosBagData"
var data = {
    tokens: {
        '+1': [1, 1, false, null],
        '0': [2, 0, false, null],
        '-1': [3, -1, false, null],
        '-2': [2, -2, false, null],
        '-3': [1, -3, false, null],
        '-4': [1, -4, false, null],
        '-5': [0, -5, false, null],
        'skull': [2, -2, false, null],
        'cultist': [2, -2, false, null],
        'tablet': [1, -3, false, null],
        'elderThing': [2, -4, false, null],
        'star': [1, 1, false, null],
        'autofail': [1, -999, false, null],
        'bless': [0, 2, true, null],
        'curse': [0, -2, true, null],
        'frost': [4, -1, true, 'frost']
    },
    modifiers: {
        '+1': [],
        '0': [],
        '-1': [],
        '-2': [],
        '-3': [],
        '-4': [],
        '-5': [],
        'skull': [],
        'cultist': [],
        'tablet': [],
        'elderThing': [],
        'star': [],
        'autofail': [],
        'bless': [],
        'curse': [],
        'frost': []
    },
    redraw_max: 4,
    variable_tokens: ['skull', 'cultist', 'tablet', 'elderThing'],
    tokenOptions: [
        { text: "", value: null },
        { text: "Bless", value: "bless" },
        { text: "Curse", value: "curse" },
        { text: "Cultist", value: "cultist" },
        { text: "Elder Thing", value: "elderThing" },
        { text: "Frost", value: "frost" },
        { text: "Tablet", value: "tablet" },
        { text: "Skull", value: "skull" }

    ],
    abilitiesActive: [],
    abilityOptions: [
        { text: 'Defiance (2)', value: 'Defiance2XP' },
        { text: 'Jim Culver', value: 'JimCulver' },
        { text: 'Ritual Candles', value: 'RitualCandles1' },
        { text: 'Ritual Candles', value: 'RitualCandles2' }
    ],
    abilityEffects: {
        'Defiance2XP': {
            'skull': ['s', 0, 'noRedraw'],
            'cultist': ['s', 0, 'noRedraw'],
            'tablet': ['s', 0, 'noRedraw'],
            'elderThing': ['s', 0, 'noRedraw']
        },
        'JimCulver': {
            'skull': ['s', 0]
        },
        'RitualCandles1': {
            'skull': ['a', 1],
            'cultist': ['a', 1],
            'tablet': ['a', 1],
            'elderThing': ['a', 1]
        },
        'RitualCandles2': {
            'skull': ['a', 2],
            'cultist': ['a', 2],
            'tablet': ['a', 2],
            'elderThing': ['a', 2]
        }
    }
}

let tryData = loadData(saveName)
if (tryData) {\
    data = tryData
}

probabilityPlot(run(data.tokens, data.abilitiesActive, data.abilityEffects, data.modifiers, data.redraw_max))

var app10 = new Vue({
    el: '#app-10',
    data: data,
    methods: {
        getProbabilitiesMessage: function() {
            console.log("abilityEffects in Vue(): ", this.abilityEffects)
            probabilityPlot(run(this.tokens, this.abilitiesActive, this.abilityEffects, this.modifiers, this.redraw_max))
        }
    }
})