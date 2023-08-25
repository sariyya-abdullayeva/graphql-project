class User {
    constructor(name, id) {
        this.name = name;
        this.id = id;
    }
}

let currentUser = null;
const errorMessage = document.querySelector('.error-message')

// This function can be used to get the user's id after they have logged in
async function getUserId(username) {
    const query = `query ($login: String) {
        user(where: {login: {_eq: $login}}) {
            id
        }
    }`

    const data = await performGraphQLQuery(query, { login: username });
    return data.data.user[0].id;
}

// This function can be used to get the user's id after they have logged in
async function getUserInfo(username) {
    const query = `query ($login: String) {
        user(where: {login: {_eq: $login}}) {
            id
            createdAt
            campus
            attrs
            profile
        }
    }`

    const data = await performGraphQLQuery(query, { login: username });
    return data.data.user[0];
}

// This function can be used to get the user's tasks
async function getUserTasks(username) {
    const query = `query ($login: String!) 
    {
        progress(
            order_by: {updatedAt: asc}, 
            where: {
                user: {login: {_eq: $login}}
                isDone: {_eq: true},
            }) 
            {
                object { name, type }  
                updatedAt
            }
    }`

    const data = await performGraphQLQuery(query, { login: username });
    return data.data.progress;
}

async function getResults(username, resultType = "exam", grade = undefined) {
    const query = `query ($login: String!) 
    {
            result(
                order_by: {updatedAt: asc}, 
                where: {
                    user: {login: {_eq: $login}}
                }) 
                {
                    object { name, type }  
                    updatedAt
                    createdAt
                    grade
                }
    }`


    const data = await performGraphQLQuery(query, { login: username });
    let selectedTypeOnly = data.data.result.filter(item => item.object.type === resultType);
    if (grade != undefined) {
        selectedTypeOnly = selectedTypeOnly.filter(item => item.grade === grade);
    }
    return selectedTypeOnly;
}

async function getUserXP(username, transactionType = "xp") {
    const query = `query ($login: String!) 
        {
            transaction(
                order_by: {createdAt: asc}, 
                    where: {
                        user: {login: {_eq: $login}}
                    }) 
                    {
                        amount
                        type
                        object { name, type }  
                        createdAt
                }
        }`


    const data = await performGraphQLQuery(query, { login: username });
    const XPs_only = data.data.transaction.filter(item => item.type === transactionType);
    return XPs_only;
}


document.getElementById('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const basicAuth = btoa(username + ":" + password);
    try {
        const response = await fetch('https://01.kood.tech/api/auth/signin', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + basicAuth
            }
        });
        if (response.ok) {
            const data = await response.text();
            localStorage.setItem('jwt', data);
            const userId = await getUserId(username);
            currentUser = new User(username, userId);

            const userTasks = await getUserTasks(username);
            const userProjects = userTasks.filter(item => item.object.type === 'project');
            const userXPs = await getUserXP(username);
            const userProjectXPs = filterUserProjects(userProjects, userXPs)

            // line plot for exercise XPs
            const exerciseXPs = userXPs.filter(item => item.object.type === 'exercise');
            const jsPiscine = userXPs.filter(i => i.object.type === "piscine")
            drawLineplotGraph(exerciseXPs, ".lineplot-graph-exercises", "Cumulative sum of XPs earned from exercises", 300, 200)

            // line plot for projects XPs
            const projectXPs = userXPs.filter(item => item.object.type === 'project');
            drawLineplotGraph(projectXPs, ".lineplot-graph-projects", "Cumulative sum of XPs earned from projects", 500, 300)

            // These two audits are used to plot a piechart
            const auditsUserDid = await getUserXP(username, transactionType = "up");
            const rawauditsOthersDidToUser = await getUserXP(username, transactionType = "down")
            auditPieChart(auditsUserDid, rawauditsOthersDidToUser, ".pie-chart-audit-ratio")


            const userPassExercises = await getResults(username, result_type = "exercise", grade = 1)
            const userFailExercises = await getResults(username, result_type = "exercise", grade = 0)
            exerciseGradesPieChart(userPassExercises, userFailExercises, ".pie-chart-exercise-grades")


            const userInfoData = await getUserInfo(username);
            setUserInfo(userInfoData, userProjectXPs, jsPiscine, auditsUserDid, rawauditsOthersDidToUser)

            // toggle login form 
            document.querySelector('.login-container').style.display = 'none'; // Hide login div
            event.target.reset(); //clear loging form
            errorMessage.textContent = "" // clean error message
            document.querySelector('.graphs-container').style.display = 'flex'; // Show graphs div

        } else {
            const errorData = await response.json();  
            errorMessage.textContent = errorData.error;
            errorMessage.style.display = 'block'; 
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

async function performGraphQLQuery(query, variables) {
    const tokenLocal = localStorage.getItem('jwt');
    const token = 'Bearer ' + tokenLocal.replace(/"/g, '').trim()

    const response = await fetch('https://01.kood.tech/api/graphql-engine/v1/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token, },
        body: JSON.stringify({
            query: query,
            variables: variables
        })
    });

    const data = await response.json();
    return data;
}



// SET USER INFO
function setUserInfo(userInfoData, userProjectXPs, jsPiscine, auditsUserDid, auditsOthersDidToUser) {
    const firstName = userInfoData.attrs.firstName
    const lastName = userInfoData.attrs.lastName
    const userNameSpan = document.querySelector('.info .name');
    const totalXpsSpan = document.querySelector('.info .total-xps');
    const auditRatioSpan = document.querySelector('.info .audit-ratio');

    //set user first and last name
    userNameSpan.textContent = `${firstName} ${lastName}`

    // set totalXps
    const jsPiscineTotal = jsPiscine[0].amount
    const totalUserProjectXPs = userProjectXPs.reduce((total, obj) => total + obj.amount, 0);
    const totalKG = (totalUserProjectXPs + jsPiscineTotal) / 1000
    totalXpsSpan.textContent = `${totalKG}KG`

    
    //set audit ratio
    const totalAuditsUserDid = auditsUserDid.reduce((total, obj) => total + obj.amount, 0); //total audits user did
    const totalAuditsOthersDidToUser = auditsOthersDidToUser.reduce((total, obj) => total + obj.amount, 0); //total audits others did to user
    const auditsUserDidInMB = totalAuditsUserDid / (1000 * 1000);// Convert bytes to MB for audits user did
    const auditsOthersDidToUserInKB = totalAuditsOthersDidToUser / 1000; // Convert bytes to KB for audits others did to user
    const auditRatio = auditsUserDidInMB / (auditsOthersDidToUserInKB / 1000); // audit ratio
    auditRatioSpan.textContent = auditRatio.toFixed(1);
}

// DRAW GRAPHS
// lineplot
function drawLineplotGraph(rawData, element, title, width, height) {
    // add totaly xp for the given time and position of the d in the array. 
    let totalXps = 0;
    const data = rawData.map((item, index) => {
        totalXps += item.amount;
        return {
            ...item,
            totalXps,
            position: index
        };
    });

    // Define the dimensions of your SVG
    const margin = { top: 30, right: 40, bottom: 50, left: 60 };

    // Create an SVG element and append it to the body
    const svg = d3.select(element)
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Define the x and y scales
    const x = d3.scaleLinear() // Changed scaleTime to scaleLinear as position is not a date/time
        .domain([0, d3.max(data, d => d.position)]) // Use d.position for domain
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.totalXps)]) // Use d.totalXps for domain
        .range([height, 0]);


    // Define the line
    const line = d3.line()
        .x(d => x(d.position)) // Use d.position for x value
        .y(d => y(d.totalXps)); // Use d.totalXps for y value

    // Define the x-axis with only two ticks: at the beginning and end of the axis
    const xAxis = d3.axisBottom(x)
        .tickValues([0, d3.max(data, d => d.position)])
        .tickFormat((d, i) => {
            return d === 0 ?
                d3.timeFormat("%Y-%m-%d")(new Date(data[0].createdAt)) :
                d3.timeFormat("%Y-%m-%d")(new Date(data[data.length - 1].createdAt));
        });

    // Add the x-axis
    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(xAxis);

    // Add the y-axis
    svg.append("g")
        .call(d3.axisLeft(y));

    // Add the line path
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("stroke-width", 1.5)
        .attr("d", line);

    // Add a title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("text-decoration", "underline")
        .text(title);
}


// piecharts
function auditPieChart(auditsUserDid, auditsOthersDidToUser, element) {
    var data = [
        { type: 'up', count: auditsUserDid.length },
        { type: 'down', count: auditsOthersDidToUser.length }
    ];
    drawPiechart(data, element, 'type', 'Audits You did', 'Audits done to you');
}
function exerciseGradesPieChart(userPassExercises, userFailExercises, element) {
    var data = [
        { grade: 1, count: userPassExercises.length },
        { grade: 0, count: userFailExercises.length }
    ];
    drawPiechart(data, element, 'grade', 'Passed Exercises', 'Failed Exercises');
}
function drawPiechart(data, element, property, label1, label2) {
    // Pie chart creation
    var width = 600;
    var height = 300;
    var radius = Math.min(width, height) / 2;
    var color = d3.scaleOrdinal(d3.schemeCategory10);

    var svg = d3.select(element)
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', 'translate(' + width / 3 + ',' + height / 2 + ')');

    var arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius);

    var pie = d3.pie()
        .value(function (d) { return d.count; })
        .sort(null);

    var path = svg.selectAll('path')
        .data(pie(data))
        .enter()
        .append('path')
        .attr('d', arc)
        .attr('fill', function (d) { return color(d.data[property]); });

    // Legend
    var legendRectSize = 18;
    var legendSpacing = 4;

    var legend = svg.selectAll('.legend')
        .data(color.domain())
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', function (d, i) {
            var height = legendRectSize + legendSpacing;
            var offset = height * color.domain().length / 2;
            var horz = width / 4 + 50;  // Adjust this value to position the legend horizontally
            var vert = i * height - offset;
            return 'translate(' + horz + ',' + vert + ')';
        });

    legend.append('rect')
        .attr('width', legendRectSize)
        .attr('height', legendRectSize)
        .style('fill', color)
        .style('stroke', color);

    legend.append('text')
        .attr('x', legendRectSize + legendSpacing)
        .attr('y', legendRectSize - legendSpacing)
        .text(function (d) {
            if (d === 1 || d === 'up') return label1;
            if (d === 0 || d === 'down') return label2;
        });
}



function filterUserProjects(userProjects, userXPs) {
    let myproject = [];
    for (let i = 0; i < userXPs.length; i++) {
        let found = false;

        for (let j = 0; j < userProjects.length; j++) {

            if (userXPs[i].object.name === userProjects[j].object.name &&
                isSameDay(userXPs[i].createdAt, userProjects[j].updatedAt)) {
                found = true;
                break;
            }
        }

        if (found) {
            myproject.push(userXPs[i]);
        }
    }
    return myproject
}
function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

//Logout
document.querySelector(".logout").addEventListener("click", ()=>{
    //clean jwt token
    localStorage.removeItem('jwt');

    // toggle login form
    document.querySelector('.login-container').style.display = 'block'; // show login div
    errorMessage.style.display = 'none'; //hide error message 
    document.querySelector('.graphs-container').style.display = 'none'; // hide graphs div

})