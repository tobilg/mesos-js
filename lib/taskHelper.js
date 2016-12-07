"use strict";

function TaskHelper(scheduler) {
    if (!(this instanceof TaskHelper)) {
        return new TaskHelper(scheduler);
    }
    var self = this;
    self.zkClient = scheduler.zkClient;
    self.scheduler = scheduler;
    self.logger = scheduler.logger;
    self.zkServicePath = self.scheduler.zkServicePath;
}

TaskHelper.prototype.deleteTask = function (taskId) {
    var self = this;
    self.zkClient.remove(self.zkServicePath + "/tasks/" + taskId, function (error) {
        if (error) {
            self.logger.error("Error deleting task ID " + taskId + " from zookeeper");
        } else {
            self.logger.debug("Deleted task " + taskId + " from zookeeper");
        }
    });
}

TaskHelper.prototype.loadTasks = function() {
    var self = this;
    self.zkClient.getChildren(self.zkServicePath + "/tasks", function (error, children, stat) {
        if (error) {
            self.logger.error("Could not load task information.");
            return;
        }
        children.forEach(function (child) {
            self.zkClient.getData(self.zkServicePath + "/tasks/" + child, function (error, data, stat) {
                if (error || !data) {
                    self.logger.error("Could not load task information for " + child);
                    if (!error) {
                        self.deleteTask(child);
                    }
                    return;
                }
                var pending = self.scheduler.pendingTasks;
                self.scheduler.pendingTasks = [];
                var task = JSON.parse(data.toString());
                self.logger.debug("Loading task: " + JSON.stringify(task));
                var found = false;
                for (var i = 0;i < pending.length; i++) {
                    var pendingTask = pending[i];
                    self.logger.debug("Pending task: \"" + JSON.stringify(pendingTask) + "\"");
                    if (pendingTask.name == task.name) {
                        // Don't load tasks in staging
                        if (task.runtimeInfo && task.runtimeInfo.agentId) {
                            self.scheduler.launchedTasks.push(task);
                            pending.splice(i, 1);
                            self.scheduler.reconcileTasks.push(task);
                        } else {
                            self.deleteTask(task.taskId);
                        }
                        found = true;
                        break;
                    }
                }
                if (i == pending.length && !found) {
                    self.logger.info("Setting task ID " + task.taskId + " to be killed")
                    self.scheduler.killTasks.push(task);
                }
                self.scheduler.pendingTasks = pending;
            });
        });
        
    });
}


TaskHelper.prototype.saveTask = function (task) {
    var self = this;
    var data = Buffer(JSON.stringify(task));
    // Seperating path creation from data save due to various client bugs.
    self.zkClient.mkdirp(self.zkServicePath+"/tasks/" + task.taskId, function (error, stat){
        if (error) {
            self.logger.error('Got error when creating task node in ZK ' + task.name + " ID " + task.taskId + ' data: ' + error);
            return;
        }
        self.zkClient.setData(self.zkServicePath+"/tasks/" + task.taskId, data, function (error, stat) {
            if (error) {
                self.logger.error('Got error when saving task ' + task.name + " ID " + task.taskId + ' data: ' + error);
                return;
            }
            self.logger.debug("Saved task " + task.name + " ID " + task.taskId);
        });
    });
}

TaskHelper.prototype.saveTasks = function () {
    var self = this;
    self.launchedTasks.forEach(self.saveTask(task));
}

module.exports = {
    TaskHelper: TaskHelper
}