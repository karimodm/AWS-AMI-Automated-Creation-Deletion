//Init AWS
var aws = require('aws-sdk');  
aws.config.region = 'eu-west-1'; //Change this to the region you like
var ec2 = new aws.EC2();  

//Variables for the script
//Changes below are not required but if you do change, then change to match delete and create lambda scripts.
const keyForEpochMakerinAMI = "DATETODEL-";
const keyForInstanceTagToBackup = "AutoDigiBackup"; //looks for string yes
const keyForInstanceTagDurationBackup = "AutoDigiBackupRetentionMonths"; // accepts number of months like 3 or 6 or 24 and so on.
const keyForInstanceTagScheduledDays = "AutoDigiBackupMonthSchedule"; //accepts day of month number: 1, 15, 31. Don't use leading 0.
const keyForInstanceTagNoReboot = "AutoDigiNoReboot"; //if true then it wont reboot. If not present or set to false then it will reboot.

//returns true or false based on tag value 
function checkIfBackupNeedsToRunToday(tagScheduleDays){
    tagScheduleDays = tagScheduleDays.trim(); //just removing accidental spaces by user.
    var today=new Date();
    var dayOfMonth = today.getDate(); 
    console.log("Should system process today? " + (tagScheduleDays == dayOfMonth));
    return tagScheduleDays == dayOfMonth;
}

//Lambda handler
exports.handler = function(event, context) { 
    
    var instanceparams = {
        Filters: [{
            Name: 'tag:' + keyForInstanceTagToBackup,
            Values: [
                'yes'
            ]
        }]
    };
    
    ec2.describeInstances(instanceparams, function(err, data) {
        if (err) console.log(err, err.stack);
        else {
            for (var i in data.Reservations) {
                for (var j in data.Reservations[i].Instances) {
                    var instanceid = data.Reservations[i].Instances[j].InstanceId;
                    var name = "", backupRetentionMonthsforAMI = -1, backupRunTodayCheck = "", noReboot = false;
                    for (var k in data.Reservations[i].Instances[j].Tags) {
                        if (data.Reservations[i].Instances[j].Tags[k].Key == 'Name') {
                            name = data.Reservations[i].Instances[j].Tags[k].Value;
                        }
                        if(data.Reservations[i].Instances[j].Tags[k].Key == keyForInstanceTagDurationBackup){
                            backupRetentionMonthsforAMI = parseInt(data.Reservations[i].Instances[j].Tags[k].Value);
                        }
                        if(data.Reservations[i].Instances[j].Tags[k].Key == keyForInstanceTagScheduledDays){
                            backupRunTodayCheck = data.Reservations[i].Instances[j].Tags[k].Value;
                        }         
                        if(data.Reservations[i].Instances[j].Tags[k].Key == keyForInstanceTagNoReboot){
                            if(data.Reservations[i].Instances[j].Tags[k].Value == "true"){
                                noReboot = true;
                            }
                        }                        
                    }
                    //cant find when to delete then dont proceed.
                    if((backupRetentionMonthsforAMI < 1) || (checkIfBackupNeedsToRunToday(backupRunTodayCheck) === false)){
                        console.log("Skipping instance Name: " + name + " backupRetentionMonthsforAMI: " + backupRetentionMonthsforAMI + " backupRunTodayCheck: " + backupRunTodayCheck + " checkIfBackupNeedsToRunToday:" + checkIfBackupNeedsToRunToday(backupRunTodayCheck) + " (backupRetentionMonthsforAMI > 0)" + (backupRetentionMonthsforAMI > 0));
                    }else{
                        console.log("Processing instance Name: " + name + " backupRetentionMonthsforAMI: " + backupRetentionMonthsforAMI + " backupRunTodayCheck: " + backupRunTodayCheck + " checkIfBackupNeedsToRunToday:" + checkIfBackupNeedsToRunToday(backupRunTodayCheck) + " (backupRetentionMonthsforAMI > 0)" + (backupRetentionMonthsforAMI > 0));                        
                        var genDate = new Date();  
                        genDate.setDate(genDate.getDate() + backupRetentionMonthsforAMI * 30); //* 30 for months that are required to be held
                        var imageparams = {
                            InstanceId: instanceid,
                            Name: name + "_" + keyForEpochMakerinAMI + genDate.getTime(),
                            // NoReboot: true - Decided based on parameter from tag
                        };
                        if(noReboot == true){
                            imageparams["NoReboot"] = true;
                        }
                        console.log(imageparams);
                        ec2.createImage(imageparams, function(err, data) {
                            if (err) console.log(err, err.stack);
                            else {
                                image = data.ImageId;
                                console.log(image);
                                var tagparams = {
                                    Resources: [image],
                                    Tags: [{
                                        Key: 'DeleteBackupsAutoOn',
                                        Value: 'yes'
                                    }]
                                };
                                ec2.createTags(tagparams, function(err, data) {
                                    if (err) console.log(err, err.stack);
                                    else console.log("Tags added to the created AMIs");
                                });
                            }
                        });
                    }
                }
            }
        }
    });
}
